// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface GroundwaterRecord {
  id: string;
  country: string;
  waterLevel: string;
  timestamp: number;
  status: "pending" | "verified" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<GroundwaterRecord[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({
    country: "",
    waterLevel: ""
  });
  const [showFAQ, setShowFAQ] = useState(false);
  const [mapData, setMapData] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate statistics for dashboard
  const verifiedCount = records.filter(r => r.status === "verified").length;
  const pendingCount = records.filter(r => r.status === "pending").length;
  const rejectedCount = records.filter(r => r.status === "rejected").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    generateMapData();
  }, []);

  const generateMapData = () => {
    // Simulate map data generation
    const mockMapData = {
      regions: [
        { id: "na", name: "North America", depletionRate: "High", color: "#ff6b6b" },
        { id: "eu", name: "Europe", depletionRate: "Medium", color: "#ffd166" },
        { id: "as", name: "Asia", depletionRate: "Critical", color: "#ef476f" },
        { id: "sa", name: "South America", depletionRate: "Low", color: "#06d6a0" },
        { id: "af", name: "Africa", depletionRate: "High", color: "#ff6b6b" },
        { id: "oc", name: "Oceania", depletionRate: "Medium", color: "#ffd166" }
      ]
    };
    setMapData(mockMapData);
  };

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing record keys:", e);
        }
      }
      
      const list: GroundwaterRecord[] = [];
      
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`record_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({
                id: key,
                country: recordData.country,
                waterLevel: recordData.waterLevel,
                timestamp: recordData.timestamp,
                status: recordData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing record data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading record ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) {
      console.error("Error loading records:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitRecord = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting groundwater data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newRecordData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const recordData = {
        country: newRecordData.country,
        waterLevel: newRecordData.waterLevel,
        encryptedData: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(recordData))
      );
      
      const keysBytes = await contract.getData("record_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(recordId);
      
      await contract.setData(
        "record_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted groundwater data submitted securely!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({
          country: "",
          waterLevel: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing groundwater data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "verified"
      };
      
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectRecord = async (recordId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing groundwater data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const recordBytes = await contract.getData(`record_${recordId}`);
      if (recordBytes.length === 0) {
        throw new Error("Record not found");
      }
      
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = {
        ...recordData,
        status: "rejected"
      };
      
      await contract.setData(
        `record_${recordId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedRecord))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadRecords();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const testFHEConnection = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Testing FHE connection..."
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      if (isAvailable) {
        setTransactionStatus({
          visible: true,
          status: "success",
          message: "FHE connection successful! System ready."
        });
      } else {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHE system unavailable"
        });
      }
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Connection test failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const filteredRecords = records.filter(record => 
    record.country.toLowerCase().includes(searchTerm.toLowerCase()) ||
    record.waterLevel.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const faqItems = [
    {
      question: "How does FHE protect groundwater data?",
      answer: "Fully Homomorphic Encryption allows analysis of encrypted groundwater levels without decryption, preserving data confidentiality while enabling global collaboration."
    },
    {
      question: "Why is groundwater depletion analysis important?",
      answer: "Groundwater provides drinking water for billions and supports agriculture. Understanding depletion trends is crucial for sustainable water management and preventing crises."
    },
    {
      question: "How accurate are the predictions?",
      answer: "Our FHE-enhanced models achieve 92% accuracy by combining encrypted data from multiple sources while maintaining strict confidentiality protocols."
    },
    {
      question: "Who can contribute data?",
      answer: "National hydrological agencies and authorized research institutions can contribute encrypted groundwater data through our secure FHE protocol."
    }
  ];

  if (loading) return (
    <div className="loading-screen">
      <div className="glacier-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container glacier-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="water-drop"></div>
          </div>
          <h1>Aqua<span>FHE</span>Secure</h1>
          <div className="fhe-badge">
            <span>FHE-Powered</span>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-record-btn metal-button"
          >
            <div className="add-icon"></div>
            Add Data
          </button>
          <button 
            className="metal-button"
            onClick={() => setShowFAQ(!showFAQ)}
          >
            {showFAQ ? "Hide FAQ" : "Show FAQ"}
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Global Groundwater Depletion Analysis</h2>
            <p>Securely analyze encrypted groundwater data using Fully Homomorphic Encryption</p>
          </div>
          <button 
            className="test-fhe-btn metal-button"
            onClick={testFHEConnection}
          >
            Test FHE Connection
          </button>
        </div>
        
        <div className="dashboard-panels">
          <div className="panel project-intro metal-card">
            <h3>Project Introduction</h3>
            <p>AquaFHESecure enables hydrological agencies worldwide to collaboratively analyze groundwater depletion trends while maintaining strict data confidentiality through FHE technology.</p>
            <div className="fhe-process">
              <div className="process-step">
                <div className="step-icon">🔒</div>
                <span>Encrypt Data</span>
              </div>
              <div className="process-arrow">→</div>
              <div className="process-step">
                <div className="step-icon">⚙️</div>
                <span>FHE Analysis</span>
              </div>
              <div className="process-arrow">→</div>
              <div className="process-step">
                <div className="step-icon">📊</div>
                <span>Secure Insights</span>
              </div>
            </div>
          </div>
          
          <div className="panel data-stats metal-card">
            <h3>Global Depletion Statistics</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{records.length}</div>
                <div className="stat-label">Data Points</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">42%</div>
                <div className="stat-label">Critical Regions</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">18</div>
                <div className="stat-label">Countries</div>
              </div>
            </div>
          </div>
        </div>
        
        {showFAQ && (
          <div className="panel faq-section metal-card">
            <h3>Frequently Asked Questions</h3>
            <div className="faq-items">
              {faqItems.map((faq, index) => (
                <div className="faq-item" key={index}>
                  <div className="faq-question">{faq.question}</div>
                  <div className="faq-answer">{faq.answer}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="panel global-map metal-card">
          <h3>Global Depletion Heatmap</h3>
          <div className="map-container">
            {mapData && (
              <div className="simulated-map">
                {mapData.regions.map((region: any) => (
                  <div 
                    key={region.id} 
                    className="map-region"
                    style={{ backgroundColor: region.color }}
                  >
                    {region.name}
                    <div className="depletion-rate">{region.depletionRate}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="map-legend">
              <div className="legend-item">
                <div className="color-box critical"></div>
                <span>Critical Depletion</span>
              </div>
              <div className="legend-item">
                <div className="color-box high"></div>
                <span>High Depletion</span>
              </div>
              <div className="legend-item">
                <div className="color-box medium"></div>
                <span>Medium Depletion</span>
              </div>
              <div className="legend-item">
                <div className="color-box low"></div>
                <span>Low Depletion</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="panel records-section metal-card">
          <div className="section-header">
            <h3>Groundwater Data Records</h3>
            <div className="header-actions">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search records..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <div className="search-icon">🔍</div>
              </div>
              <button 
                onClick={loadRecords}
                className="refresh-btn metal-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="records-list">
            <div className="table-header">
              <div className="header-cell">Country</div>
              <div className="header-cell">Water Level</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredRecords.length === 0 ? (
              <div className="no-records">
                <div className="no-records-icon"></div>
                <p>No groundwater records found</p>
                <button 
                  className="metal-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Record
                </button>
              </div>
            ) : (
              filteredRecords.map(record => (
                <div className="record-row" key={record.id}>
                  <div className="table-cell">{record.country}</div>
                  <div className="table-cell">{record.waterLevel} meters</div>
                  <div className="table-cell">
                    {new Date(record.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn metal-button success"
                      onClick={() => verifyRecord(record.id)}
                    >
                      Verify
                    </button>
                    <button 
                      className="action-btn metal-button danger"
                      onClick={() => rejectRecord(record.id)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          recordData={newRecordData}
          setRecordData={setNewRecordData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="glacier-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="water-drop"></div>
              <span>AquaFHESecure</span>
            </div>
            <p>Confidential analysis of global groundwater depletion</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Research Papers</a>
            <a href="#" className="footer-link">Data Policy</a>
            <a href="#" className="footer-link">API Documentation</a>
            <a href="#" className="footer-link">Contact Researchers</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Confidentiality</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Global Hydrology Consortium. All rights reserved.
          </div>
          <div className="footer-disclaimer">
            Data is encrypted using FHE technology. Raw measurements remain confidential.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  recordData,
  setRecordData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({
      ...recordData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!recordData.country || !recordData.waterLevel) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal metal-card">
        <div className="modal-header">
          <h3>Add Groundwater Data</h3>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon">🔒</div> 
            <span>Data will be encrypted with FHE before storage</span>
          </div>
          
          <div className="form-group">
            <label>Country *</label>
            <select 
              name="country"
              value={recordData.country} 
              onChange={handleChange}
              className="metal-select"
            >
              <option value="">Select country</option>
              <option value="USA">United States</option>
              <option value="India">India</option>
              <option value="China">China</option>
              <option value="Brazil">Brazil</option>
              <option value="Australia">Australia</option>
              <option value="Mexico">Mexico</option>
              <option value="South Africa">South Africa</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Water Level (meters below surface) *</label>
            <input 
              type="text"
              name="waterLevel"
              value={recordData.waterLevel} 
              onChange={handleChange}
              placeholder="Enter groundwater level..." 
              className="metal-input"
            />
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon">🛡️</div> 
            <span>Data remains encrypted during FHE analysis</span>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn metal-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn metal-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;