const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    QueryCommand, 
    PutCommand, 
    DeleteCommand 
} = require("@aws-sdk/lib-dynamodb");

const client = new DynamoDBClient({});
const dynamo = DynamoDBDocumentClient.from(client);
const tableName = process.env.TABLE_NAME;

exports.handler = async (event) => {
    // Logs the exact event to CloudWatch Logs for debugging and troubleshooting
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    let body;
    let statusCode = 200;
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Prevents CORS blockages in the browser
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    // 1. Immediate response for CORS preflight requests (OPTIONS)
    if (event.requestContext && event.requestContext.http && event.requestContext.http.method === "OPTIONS") {
        return { statusCode: 204, headers, body: "" };
    }

    try {
        // Safe extraction of the route key
        let routeKey = event.routeKey;
        if (!routeKey && event.requestContext && event.requestContext.http) {
            routeKey = `${event.requestContext.http.method} ${event.requestContext.http.path}`;
        }

        if (!routeKey) {
            statusCode = 400;
            throw new Error("Could not determine routeKey from API Gateway event.");
        }

        // Ensure queryStringParameters is never null
        const queryParams = event.queryStringParameters || {};

        switch (routeKey) {
            // REQUIREMENT: "The inventory app shall allow to remove items."
            case "DELETE /items":
                if (!queryParams.id) {
                    statusCode = 400;
                    throw new Error("Missing required query parameter: id");
                }
                await dynamo.send(new DeleteCommand({
                    TableName: tableName,
                    Key: { id: queryParams.id }
                }));
                body = { message: `Item ${queryParams.id} deleted successfully` };
                break;

            // REQUIREMENT: "The inventory app shall allow to list all items." AND "to search for items."
            case "GET /items":
                const searchParam = queryParams.search;
                
                if (searchParam && searchParam.trim() !== "") {
                    // Highly efficient lookup via the NameIndex defined in dynamodb.tf
                    const queryResult = await dynamo.send(new QueryCommand({
                        TableName: tableName,
                        IndexName: "NameIndex",
                        KeyConditionExpression: "#nameAttr = :searchVal",
                        ExpressionAttributeNames: { "#nameAttr": "name" },
                        ExpressionAttributeValues: { ":searchVal": searchParam.trim() }
                    }));
                    body = queryResult.Items || [];
                } else {
                    // Default fallback: List all items
                    const scanResult = await dynamo.send(new ScanCommand({ TableName: tableName }));
                    body = scanResult.Items || [];
                }
                break;

            // REQUIREMENT: "The inventory app shall allow to add new items."
            case "POST /items":
                if (!event.body) {
                    statusCode = 400;
                    throw new Error("Missing request body.");
                }

                let requestBody;
                try {
                    requestBody = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
                } catch (e) {
                    statusCode = 400;
                    throw new Error("Malformed JSON payload in request body.");
                }

                if (!requestBody || !requestBody.id || !requestBody.name) {
                    statusCode = 400;
                    throw new Error("Validation Error: fields 'id' and 'name' are mandatory.");
                }
                
                const item = {
                    id: String(requestBody.id).trim(),
                    name: String(requestBody.name).trim(),
                    quantity: requestBody.quantity ? Number(requestBody.quantity) : 0,
                    category: requestBody.category ? String(requestBody.category).trim() : "General",
                    updatedAt: new Date().toISOString()
                };

                await dynamo.send(new PutCommand({
                    TableName: tableName,
                    Item: item
                }));
                body = item;
                break;

            default:
                statusCode = 404;
                body = { error: `Unsupported route: "${routeKey}"` };
        }
    } catch (err) {
        console.error("Caught Lambda Execution Error:", err);
        // Keep the specific validation status code if already set, otherwise default to 500
        statusCode = statusCode === 200 ? 500 : statusCode;
        body = { error: err.message };
    }

    return {
        statusCode,
        headers,
        body: JSON.stringify(body)
    };
};
