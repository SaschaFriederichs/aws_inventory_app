import { useState, useEffect } from 'react';
import './App.css';
// Loads the API-Gateway-URL from .env.production file
const API_URL = import.meta.env.VITE_API_URL;

function App() {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    // State for the entry form (Add Item)
    const [newItem, setNewItem] = useState({
        id: '',
        name: '',
        quantity: 0,
        category: ''
    });

    // Requirement: "The inventory app shall allow to list all items."
    // Requirement: "The inventory app shall allow to search for items."
    const fetchItems = async (search = '') => {
        if (!API_URL) {
            setError('API_URL is not configured. Please check the .env.production file.');
            return;
        }

        setLoading(true);
        setError(null);
        try {
            let url = `${API_URL}/items`;
            // If a search entry is transfered, then we append it as query parameter
            if (search) {
                url += `?search=${encodeURIComponent(search)}`;
            }
      
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }
      
            const data = await response.json();
            setItems(Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('Fetch error:', err);
            setError(`Connection to the AWS-Backend failed: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    // If the website loads for the first time fetch all articles once
    useEffect(() => {
        fetchItems();
    }, []);

    // Handler for the transmission of the search
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        fetchItems(searchTerm);
    };

    // Handler for the clearing of the search
    const handleSearchReset = () => {
        setSearchTerm('');
        fetchItems('');
    };

    // Requirement: "The inventory app shall allow to add new items."
    const handleAddItem = async (e) => {
        e.preventDefault();
    
        // Validation: Check mandatory fields
        if (!newItem.id.trim() || !newItem.name.trim()) {
            alert('Please fill in all mandatory fields (Product ID and Item name).');
            return;
        }
    
        try {
            const response = await fetch(`${API_URL}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: newItem.id.trim(),
                    name: newItem.name.trim(),
                    quantity: Number(newItem.quantity) || 0,
                    category: newItem.category.trim() || 'General'
                })
            });
    
            if (!response.ok) {
                throw new Error('Article could not be added to DynamoDB.');
            }
    
            // Reset form and reload list from server
            setNewItem({ id: '', name: '', quantity: 0, category: '' });
            fetchItems(searchTerm); // Behält eine eventuell aktive Suche bei
        } catch (err) {
            alert(`Error: ${err.message}`);
        }
    };

    // Requirement: "The inventory app shall allow to remove items."
    const handleDeleteItem = async (id) => {
        if (!window.confirm(`Do you really want to delete article ID "${id}" ?`)) {
            return;
        }
    
        try {
            const response = await fetch(`${API_URL}/items?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            });
    
            if (!response.ok) {
                throw new Error('Arcticle could not be deleted from DynamoDB.');
            }
    
            // Reload list
            fetchItems(searchTerm);
        } catch (err) {
            alert(`Fehler: ${err.message}`);
        }
    };

    return (
        <div className="inventory-container">
            <header>
                <h1>📦 AWS Inventory App </h1>
                <p className="subtitle">Serverless Application – Built with Terraform, AWS Lambda & Amazon DynamoDB</p>
            </header>

        <main>
            {/* Report failure if AWS-Backend is offline. */}
            {error && <div className="error-message" role="alert">❌ {error}</div>}

            {/* 1. Section: Search (On top over the full width) */}
            <section className="search-section" aria-label="Search Inventory">
                <form onSubmit={handleSearchSubmit} className="search-form">
                    <input
                        type="text"
                        placeholder="Search items by exact name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        aria-label="Search string"
                    />
                    <button type="submit">🔍 Search</button>
                        {searchTerm && (
                    <button type="button" onClick={handleSearchReset}>
                        Clear
                    </button>
                    )}
                </form>
            </section>

            {/* 2. Section: Add article (Left column in the grid) */}
            <section className="form-section">
                <h2>Add New Item</h2>
                <form onSubmit={handleAddItem} className="inventory-form">
                    <input
                        type="text"
                        placeholder="Product ID (e.g., PROD-100)"
                        value={newItem.id}
                        onChange={(e) => setNewItem({ ...newItem, id: e.target.value })}
                        required
                        aria-label="Product ID"
                    />
                    <input
                        type="text"
                        placeholder="Item Name"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        required
                        aria-label="Item Name"
                    />
                    <input
                        type="number"
                        placeholder="Quantity"
                        value={newItem.quantity}
                        onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })}
                        min="0"
                        required
                        aria-label="Quantity"
                    />
                    <input
                        type="text"
                        placeholder="Category (e.g., Hardware)"
                        value={newItem.category}
                        onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                        aria-label="Category"
                    />
                    <button type="submit">➕ Add Item</button>
                </form>
            </section>

            {/* 3. Section: Inventory table (Right column in the grid) */}
            <section className="list-section">
                <h2>Current Stock</h2>
          
                {loading ? (
                    <p className="no-data">Requesting AWS resources...</p>
                ) : items.length === 0 ? (
                    <p className="no-data">No items found in your DynamoDB cluster.</p>
                ) : (
                    <div className="table-responsive">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Category</th>
                                    <th>Quantity</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id}>
                                        <td><code>{item.id}</code></td>
                                        <td><strong>{item.name}</strong></td>
                                        <td><span className="badge-category">{item.category}</span></td>
                                        <td>{item.quantity}</td>
                                        <td>
                                            <button 
                                                className="btn-delete"
                                                onClick={() => handleDeleteItem(item.id)}
                                                aria-label={`Delete item ${item.name}`}
                                                >
                                                🗑️ Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
        <footer className="inventory-app-footer">
            <p>&copy; {new Date().getFullYear()} Sascha Friederichs</p>
            <div className="footer-legal-links">
                <a href="/legal_notice.html" target="_blank" rel="noreferrer">Legal Notice</a> | {' '}
                <a href="/privacy_policy.html" target="_blank" rel="noreferrer">Privacy Policy</a>
            </div>
        </footer>   
    </div>
    );
}

export default App;
