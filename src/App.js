import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, query, where, onSnapshot, serverTimestamp, orderBy, writeBatch, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, ComposedChart } from 'recharts';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// --- Firebase Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// --- Gemini API Helper ---
const callGeminiAPI = async (payload, retries = 3, delay = 1000) => {
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            if (response.status === 429 && retries > 0) {
                await new Promise(res => setTimeout(res, delay));
                return callGeminiAPI(payload, retries - 1, delay * 2);
            }
            throw new Error(`API request failed with status ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Gemini API call failed:", error);
        throw error;
    }
};

// --- Main App Component ---
export default function App() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState('login');
    const [selectedPlayerProfile, setSelectedPlayerProfile] = useState(null);
    const [allPlayers, setAllPlayers] = useState([]);

    const coachId = user ? user.uid : 'default-coach';
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
            } else {
                try {
                    const userCredential = await signInAnonymously(auth);
                    setUser(userCredential.user);
                } catch (error) {
                    console.error("Error signing in anonymously:", error);
                }
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!coachId || coachId === 'default-coach') return;
        const playersCollectionRef = collection(db, `artifacts/${appId}/users/${coachId}/players`);
        const q = query(playersCollectionRef);
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const playersData = [];
            querySnapshot.forEach((doc) => {
                playersData.push({ id: doc.id, ...doc.data() });
            });
            setAllPlayers(playersData);
        });
        return () => unsubscribe();
    }, [coachId, appId]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen bg-gray-900 text-white"><div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div></div>;
    }

    if (view === 'login') {
        return <LoginScreen setView={setView} setSelectedPlayerProfile={setSelectedPlayerProfile} allPlayers={allPlayers} />;
    }
    if (view === 'coach') {
        return <CoachView coachId={coachId} appId={appId} setView={setView} allPlayers={allPlayers}/>;
    }
    if (view === 'player' && selectedPlayerProfile) {
        return <PlayerView player={selectedPlayerProfile} coachId={coachId} appId={appId} setView={setView} />;
    }
    return <div className="text-center p-8">Error: View not found.</div>;
}

// --- Login Screen Component ---
function LoginScreen({ setView, setSelectedPlayerProfile, allPlayers }) {
    const [password, setPassword] = useState('');
    const [selectedPlayerId, setSelectedPlayerId] = useState('');
    const [error, setError] = useState('');

    const handleCoachLogin = () => {
        if (password === 'Isaac') {
            setView('coach');
        } else {
            setError('Incorrect master password.');
        }
    };

    const handlePlayerLogin = () => {
        const player = allPlayers.find(p => p.id === selectedPlayerId);
        if (player && player.password === password) {
            setSelectedPlayerProfile(player);
            setView('player');
        } else {
            setError('Incorrect password for selected player.');
        }
    };

    return (
        <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center justify-center p-4">
            <h1 className="text-4xl font-bold text-blue-400 mb-8">Playbook Pro</h1>
            <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-2xl">
                <h2 className="text-2xl font-semibold mb-6 text-center">Login</h2>
                {error && <p className="text-red-500 text-center mb-4">{error}</p>}
                <div className="space-y-4">
                    <div className="border border-gray-600 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-blue-400">Coach Login</h3>
                        <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setSelectedPlayerId(''); setError(''); }} placeholder="Master Password" className="bg-gray-700 p-2 rounded w-full mt-2"/>
                        <button onClick={handleCoachLogin} className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors">Login as Coach</button>
                    </div>
                    <div className="border border-gray-600 p-4 rounded-lg">
                        <h3 className="text-lg font-semibold text-green-400">Player Login</h3>
                        <select onChange={(e) => { setSelectedPlayerId(e.target.value); setPassword(''); setError(''); }} value={selectedPlayerId} className="bg-gray-700 p-2 rounded w-full mt-2">
                            <option value="">-- Select Your Name --</option>
                            {allPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {selectedPlayerId && (
                            <React.Fragment>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Player Password" className="bg-gray-700 p-2 rounded w-full mt-2"/>
                                <button onClick={handlePlayerLogin} className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors">Login as Player</button>
                            </React.Fragment>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// --- Coach View Component ---
function CoachView({ coachId, appId, setView, allPlayers }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const [players, setPlayers] = useState([]);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [newPlayerPassword, setNewPlayerPassword] = useState('');
    const [playerToDelete, setPlayerToDelete] = useState(null);

    useEffect(() => {
        if (coachId === 'default-coach') return;
        const playersCollectionRef = collection(db, `artifacts/${appId}/users/${coachId}/players`);
        const q = query(playersCollectionRef, orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const playersData = [];
            querySnapshot.forEach((doc) => {
                playersData.push({ id: doc.id, ...doc.data() });
            });
            setPlayers(playersData);
            if (!selectedPlayer && playersData.length > 0) {
                setSelectedPlayer(playersData[0]);
            } else if (selectedPlayer) {
                const stillExists = playersData.find(p => p.id === selectedPlayer.id);
                if (!stillExists && playersData.length > 0) {
                    setSelectedPlayer(playersData[0]);
                } else if (!stillExists) {
                    setSelectedPlayer(null);
                }
            }
        });
        return () => unsubscribe();
    }, [coachId, appId, selectedPlayer]);

    const handleAddPlayer = async () => {
        if (newPlayerName.trim() === '' || newPlayerPassword.trim() === '') {
            alert("Please provide a name and password.");
            return;
        }
        const newPlayer = { name: newPlayerName, password: newPlayerPassword, coachId: coachId, createdAt: serverTimestamp() };
        try {
            const docRef = await addDoc(collection(db, `artifacts/${appId}/users/${coachId}/players`), newPlayer);
            setNewPlayerName('');
            setNewPlayerPassword('');
            setSelectedPlayer({ id: docRef.id, ...newPlayer });
        } catch (error) {
            console.error("Error adding player: ", error);
        }
    };
    
    const handleDeletePlayer = async (playerId) => {
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${coachId}/players`, playerId));
            setPlayerToDelete(null);
            alert("Player deleted.");
        } catch (error) {
            console.error("Error deleting player: ", error);
            alert("Failed to delete player.");
        }
    };
    
    const coachTabs = ['dashboard', 'reports', 'team', 'drill library', 'throwing', 'lifting', 'nutrition', 'messaging'];

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            {playerToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-gray-800 p-8 rounded-lg shadow-xl">
                        <h2 className="text-xl font-bold mb-4">Are you sure?</h2>
                        <p className="mb-6">This will permanently delete {playerToDelete.name} and all their data.</p>
                        <div className="flex justify-end gap-4">
                            <button onClick={() => setPlayerToDelete(null)} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Cancel</button>
                            <button onClick={() => handleDeletePlayer(playerToDelete.id)} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded">Delete Player</button>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex flex-col md:flex-row">
                <aside className="w-full md:w-64 bg-gray-800 p-4 md:min-h-screen">
                    <div className="flex justify-between items-center mb-6"><h1 className="text-2xl font-bold text-blue-400">Coach View</h1><button onClick={() => setView('login')} className="text-sm text-gray-400 hover:text-white">Logout</button></div>
                    <nav className="flex flex-row md:flex-col justify-around md:justify-start">{coachTabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={`capitalize text-left p-2 my-1 w-full rounded-md transition-all duration-200 ${activeTab === tab ? 'bg-blue-500 text-white shadow-lg' : 'hover:bg-gray-700'}`}>{tab}</button>))}</nav>
                    <div className="mt-8">
                        <h2 className="text-lg font-semibold mb-2">Players</h2>
                        <div className="space-y-2">{players.map(player => (<div key={player.id} className="flex items-center gap-2"><button onClick={() => setSelectedPlayer(player)} className={`w-full text-left p-2 rounded-md ${selectedPlayer?.id === player.id ? 'bg-gray-600' : 'bg-gray-700 hover:bg-gray-600'}`}>{player.name}</button><button onClick={() => setPlayerToDelete(player)} className="text-red-500 hover:text-red-400 p-1">X</button></div>))}</div>
                        <div className="mt-4 p-2 border border-gray-600 rounded-lg">
                            <h3 className="text-sm font-semibold mb-2">Add New Player</h3>
                            <input type="text" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Player Name" className="bg-gray-700 p-2 rounded w-full text-sm mb-2" />
                            <input type="password" value={newPlayerPassword} onChange={(e) => setNewPlayerPassword(e.target.value)} placeholder="Player Password" className="bg-gray-700 p-2 rounded w-full text-sm mb-2" />
                            <button onClick={handleAddPlayer} className="bg-blue-500 p-2 rounded w-full hover:bg-blue-600 text-sm">+</button>
                        </div>
                    </div>
                </aside>
                <main className="flex-1 p-4 md:p-8">
                    {activeTab === 'team' ? <TeamManagement coachId={coachId} appId={appId} allPlayers={allPlayers} /> : 
                     activeTab === 'drill library' ? <DrillLibrary coachId={coachId} appId={appId} /> : (
                        selectedPlayer ? (
                            <div>
                                <h2 className="text-3xl font-bold mb-6">{selectedPlayer.name}'s <span className="text-blue-400 capitalize">{activeTab}</span></h2>
                                {activeTab === 'dashboard' && <Dashboard player={selectedPlayer} coachId={coachId} appId={appId} />}
                                {activeTab === 'reports' && <Reports player={selectedPlayer} coachId={coachId} appId={appId} />}
                                {activeTab === 'throwing' && <ThrowingProgram player={selectedPlayer} coachId={coachId} appId={appId} isPlayerView={false} />}
                                {activeTab === 'lifting' && <LiftingProgram player={selectedPlayer} coachId={coachId} appId={appId} isPlayerView={false} />}
                                {activeTab === 'nutrition' && <NutritionCalculator player={selectedPlayer} coachId={coachId} appId={appId} />}
                                {activeTab === 'messaging' && <MessagingCenter player={selectedPlayer} coachId={coachId} appId={appId} senderName="Coach"/>}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full bg-gray-800 rounded-lg p-8"><h2 className="text-2xl font-bold mb-4">Welcome, Coach!</h2><p className="text-gray-400">Please add or select a player to get started.</p></div>
                        )
                    )}
                </main>
            </div>
        </div>
    );
}

// --- Player View Component ---
function PlayerView({ player, coachId, appId, setView }) {
    const [activeTab, setActiveTab] = useState('dashboard');
    const playerTabs = ['dashboard', 'wellness log', 'team', 'drill library', 'throwing', 'lifting', 'messaging'];
    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <div className="flex flex-col md:flex-row">
                <aside className="w-full md:w-64 bg-gray-800 p-4 md:min-h-screen">
                    <div className="flex justify-between items-center mb-6"><h1 className="text-2xl font-bold text-green-400">Player View</h1><button onClick={() => setView('login')} className="text-sm text-gray-400 hover:text-white">Logout</button></div>
                    <h2 className="text-xl font-semibold mb-6">{player.name}</h2>
                    <nav className="flex flex-row md:flex-col justify-around md:justify-start">{playerTabs.map(tab => (<button key={tab} onClick={() => setActiveTab(tab)} className={`capitalize text-left p-2 my-1 w-full rounded-md transition-all duration-200 ${activeTab === tab ? 'bg-green-500 text-white shadow-lg' : 'hover:bg-gray-700'}`}>{tab}</button>))}</nav>
                </aside>
                <main className="flex-1 p-4 md:p-8">
                    <div>
                        <h2 className="text-3xl font-bold mb-6">My <span className="text-green-400 capitalize">{activeTab}</span></h2>
                        {activeTab === 'dashboard' && <Dashboard player={player} coachId={coachId} appId={appId} />}
                        {activeTab === 'wellness log' && <DailyQuestionnaire player={player} coachId={coachId} appId={appId} />}
                        {activeTab === 'team' && <TeamManagement coachId={coachId} appId={appId} isPlayerView={true} />}
                        {activeTab === 'drill library' && <DrillLibrary coachId={coachId} appId={appId} isPlayerView={true} />}
                        {activeTab === 'throwing' && <ThrowingProgram player={player} coachId={coachId} appId={appId} isPlayerView={true} />}
                        {activeTab === 'lifting' && <LiftingProgram player={player} coachId={coachId} appId={appId} isPlayerView={true} />}
                        {activeTab === 'messaging' && <MessagingCenter player={player} coachId={coachId} appId={appId} senderName={player.name} />}
                    </div>
                </main>
            </div>
        </div>
    );
}
        
// --- All other components are included below ---
// ... (Implementations from previous turn)
            
const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);

