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
    console.log("Received event:", JSON.stringify(event, null, 2));
    
    let body;
    let statusCode = 200;
    const headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*", // Wichtig für CORS (S3-Frontend)
        "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type"
    };

    try {
        const routeKey = `${event.requestContext.http.method} ${event.requestContext.http.path}`;

        switch (routeKey) {
            // ANFORDERUNG: "The inventory app shall allow to remove items."
            case "DELETE /items":
                if (!event.queryStringParameters || !event.queryStringParameters.id) {
                    throw new Error("Missing query parameter: id");
                }
                await dynamo.send(new DeleteCommand({
                    TableName: tableName,
                    Key: { id: event.queryStringParameters.id }
                }));
                body = { message: `Item ${event.queryStringParameters.id} deleted successfully` };
                break;

            // ANFORDERUNG: "The inventory app shall allow to list all items." AND "to search for items."
            case "GET /items":
                const searchParam = event.queryStringParameters && event.queryStringParameters.search;
                
                if (searchParam) {
                    // Nutzt deinen in dynamodb.tf definierten Global Secondary Index für eine hocheffiziente Suche
                    const queryParams = {
                        TableName: tableName,
                        IndexName: "NameIndex",
                        KeyConditionExpression: "#nameAttr = :searchVal",
                        ExpressionAttributeNames: { "#nameAttr": "name" },
                        ExpressionAttributeValues: { ":searchVal": searchParam }
                    };
                    const queryResult = await dynamo.send(new QueryCommand(queryParams));
                    body = queryResult.Items;
                } else {
                    // Wenn kein Suchbegriff übergeben wurde, listet die App alle Elemente auf
                    const scanParams = { TableName: tableName };
                    const scanResult = await dynamo.send(new ScanCommand(scanParams));
                    body = scanResult.Items;
                }
                break;

            // ANFORDERUNG: "The inventory app shall allow to add new items."
            case "POST /items":
                let requestBody = JSON.parse(event.body);
                if (!requestBody.id || !requestBody.name) {
                    statusCode = 400;
                    throw new Error("Validation Error: id and name are required fields.");
                }
                
                // Hier werden zusätzliche Felder wie "quantity" dynamisch beim Speichern angelegt
                const item = {
                    id: requestBody.id,
                    name: requestBody.name,
                    quantity: requestBody.quantity ? Number(requestBody.quantity) : 0,
                    category: requestBody.category || "Uncategorized",
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
                throw new Error(`Unsupported route: "${routeKey}"`);
        }
    } catch (err) {
        console.error(err);
        if (statusCode === 200) statusCode = 500;
        body = { error: err.message };
    }

    return {
        statusCode,
        headers,
        body: JSON.stringify(body)
    };
};
