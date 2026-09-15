import { useState, useEffect } from 'react';
import './App.css';

// Lädt die API-Gateway-URL aus deiner .env.production-Datei
const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Zustand für das Eingabeformular (Add Item)
  const [newItem, setNewItem] = useState({
    id: '',
    name: '',
    quantity: 0,
    category: ''
  });

  // ANFORDERUNG: "The inventory app shall allow to list all items."
  // ANFORDERUNG: "The inventory app shall allow to search for items."
  const fetchItems = async (search = '') => {
    if (!API_URL) {
      setError('API_URL ist nicht konfiguriert. Bitte prüfe deine .env.production-Datei.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let url = `${API_URL}/items`;
      // Wenn ein Suchbegriff übergeben wird, hängen wir ihn als Query-Parameter an
      if (search) {
        url += `?search=${encodeURIComponent(search)}`;
      }
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`Server-Fehler: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Fetch error:', err);
      setError(`Verbindung zum AWS-Backend fehlgeschlagen: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Beim ersten Laden der Webseite alle Artikel einmalig abrufen
  useEffect(() => {
    fetchItems();
  }, []);

  // Handler für das Absenden der Suche
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchItems(searchTerm);
  };

  // Handler für das Zurücksetzen der Suche
  const handleSearchReset = () => {
    setSearchTerm('');
    fetchItems('');
  };

  // ANFORDERUNG: "The inventory app shall allow to add new items."
  const handleAddItem = async (e) => {
    e.preventDefault();
    
    // Validierung: Pflichtfelder prüfen
    if (!newItem.id.trim() || !newItem.name.trim()) {
      alert('Bitte fülle die Pflichtfelder (Product ID und Item Name) aus.');
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
        throw new Error('Artikel konnte nicht zur DynamoDB hinzugefügt werden.');
      }

      // Formular zurücksetzen und Liste vom Server neu laden
      setNewItem({ id: '', name: '', quantity: 0, category: '' });
      fetchItems(searchTerm); // Behält eine eventuell aktive Suche bei
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  // ANFORDERUNG: "The inventory app shall allow to remove items."
  const handleDeleteItem = async (id) => {
    if (!window.confirm(`Möchtest du den Artikel mit der ID "${id}" wirklich löschen?`)) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/items?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error('Artikel konnte nicht aus der DynamoDB gelöscht werden.');
      }

      // Liste neu laden
      fetchItems(searchTerm);
    } catch (err) {
      alert(`Fehler: ${err.message}`);
    }
  };

  return (
    <div className="inventory-container">
      <header>
        <h1>📦 Serverless Inventory Dashboard</h1>
        <p className="subtitle">Enterprise Infrastructure – Built with Terraform, AWS Lambda & Amazon DynamoDB</p>
      </header>

      <main>
        {/* Fehleranzeige (Falls das AWS-Backend offline ist) */}
        {error && <div className="error-message" role="alert">❌ {error}</div>}

        {/* 1. SEKTION: Suche (Oben über die volle Breite) */}
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

        {/* 2. SEKTION: Artikel hinzufügen (Linke Spalte im Grid) */}
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

        {/* 3. SEKTION: Inventar-Tabelle (Rechte Spalte im Grid) */}
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
    </div>
  );
}

export default App;
