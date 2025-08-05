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
function TeamManagement({ coachId, appId, isPlayerView = false, allPlayers = [] }) {
    const [announcements, setAnnouncements] = useState([]);
    const [newAnnouncement, setNewAnnouncement] = useState('');
    const [events, setEvents] = useState([]);
    const [newEvent, setNewEvent] = useState({ date: '', title: ''});
    const [teamView, setTeamView] = useState('announcements');

    const announcementsRef = collection(db, `artifacts/${appId}/public/data/announcements`);
    const calendarRef = collection(db, `artifacts/${appId}/public/data/calendar`);

    useEffect(() => {
        const qAnnounce = query(announcementsRef, orderBy('timestamp', 'desc'));
        const unsubAnnounce = onSnapshot(qAnnounce, (snap) => setAnnouncements(snap.docs.map(d => ({id: d.id, ...d.data()}))));
        
        const qCalendar = query(calendarRef, orderBy('date', 'asc'));
        const unsubCalendar = onSnapshot(qCalendar, (snap) => setEvents(snap.docs.map(d => ({id: d.id, ...d.data()}))));

        return () => { unsubAnnounce(); unsubCalendar(); };
    }, [appId]);

    const handlePostAnnouncement = async () => {
        if (newAnnouncement.trim() === '') return;
        await addDoc(announcementsRef, { text: newAnnouncement, timestamp: serverTimestamp() });
        setNewAnnouncement('');
    };
    
    const handleAddEvent = async () => {
        if (newEvent.date.trim() === '' || newEvent.title.trim() === '') return;
        await addDoc(calendarRef, newEvent);
        setNewEvent({ date: '', title: ''});
    };

    return (
        <div>
            <div className="flex gap-4 mb-6 border-b border-gray-700">
                <button onClick={() => setTeamView('announcements')} className={`pb-2 ${teamView === 'announcements' ? 'border-b-2 border-blue-500' : ''}`}>Announcements</button>
                <button onClick={() => setTeamView('calendar')} className={`pb-2 ${teamView === 'calendar' ? 'border-b-2 border-blue-500' : ''}`}>Calendar</button>
                {!isPlayerView && <button onClick={() => setTeamView('roster')} className={`pb-2 ${teamView === 'roster' ? 'border-b-2 border-blue-500' : ''}`}>Roster</button>}
            </div>

            {teamView === 'announcements' && (
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-300">Team Announcements</h3>
                    {!isPlayerView && (<div className="flex gap-2 mb-4"><input type="text" value={newAnnouncement} onChange={e => setNewAnnouncement(e.target.value)} placeholder="New announcement..." className="bg-gray-700 p-2 rounded w-full"/><button onClick={handlePostAnnouncement} className="bg-blue-500 p-2 rounded hover:bg-blue-600">Post</button></div>)}
                    <div className="space-y-3 max-h-96 overflow-y-auto">{announcements.map(a => <div key={a.id} className="bg-gray-700 p-3 rounded">{a.text}</div>)}</div>
                </div>
            )}
            {teamView === 'calendar' && (
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-300">Team Calendar</h3>
                    {!isPlayerView && (<div className="flex gap-2 mb-4"><input type="date" value={newEvent.date} onChange={e => setNewEvent({...newEvent, date: e.target.value})} className="bg-gray-700 p-2 rounded"/><input type="text" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} placeholder="Event title..." className="bg-gray-700 p-2 rounded w-full"/><button onClick={handleAddEvent} className="bg-blue-500 p-2 rounded hover:bg-blue-600">Add</button></div>)}
                    <div className="space-y-3 max-h-96 overflow-y-auto">{events.map(e => <div key={e.id} className="bg-gray-700 p-3 rounded"><span className="font-bold text-blue-400">{e.date}:</span> {e.title}</div>)}</div>
                </div>
            )}
            {teamView === 'roster' && !isPlayerView && (
                 <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-300">Team Roster</h3>
                    <table className="w-full text-left">
                        <thead><tr className="border-b border-gray-600"><th className="p-2">Name</th><th className="p-2">Password</th></tr></thead>
                        <tbody>{allPlayers.map(p => <tr key={p.id} className="border-b border-gray-700"><td className="p-2">{p.name}</td><td className="p-2 font-mono">{p.password}</td></tr>)}</tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

function Reports({ player, coachId, appId }) {
    const [allLogs, setAllLogs] = useState([]);
    
    useEffect(() => {
        if (!player) return;
        const logsCollectionRef = collection(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/logs`);
        const q = query(logsCollectionRef, orderBy('date', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => setAllLogs(snapshot.docs.map(d => d.data())));
        return () => unsubscribe();
    }, [player, coachId, appId]);

    const wellnessLogs = allLogs.filter(log => log.type === 'wellness').sort((a, b) => new Date(a.date) - new Date(b.date));
    const throwingLogs = allLogs.filter(log => log.type === 'throw').sort((a, b) => new Date(a.date) - new Date(b.date));

    const combinedData = wellnessLogs.map(w => {
        const matchingThrow = throwingLogs.find(t => t.date === w.date);
        return {
            date: w.date,
            sleep: Number(w.sleepHours),
            armFeel: matchingThrow ? matchingThrow.feel : null
        };
    }).filter(d => d.armFeel !== null);

    return (
        <div className="space-y-8">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-4 text-blue-300">Wellness Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={wellnessLogs}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="date" stroke="#a0aec0" />
                        <YAxis stroke="#a0aec0" domain={[0, 10]}/>
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none' }} />
                        <Legend />
                        <Line type="monotone" dataKey="overallFeel" name="Overall" stroke="#8884d8" />
                        <Line type="monotone" dataKey="armFeel" name="Arm" stroke="#82ca9d" />
                        <Line type="monotone" dataKey="legsFeel" name="Legs" stroke="#ffc658" />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-semibold mb-4 text-blue-300">Sleep vs. Arm Feel</h3>
                 <ResponsiveContainer width="100%" height={300}>
                    <ComposedChart data={combinedData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#4a5568" />
                        <XAxis dataKey="date" stroke="#a0aec0" />
                        <YAxis yAxisId="left" stroke="#8884d8" label={{ value: 'Sleep (hrs)', angle: -90, position: 'insideLeft' }} />
                        <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" domain={[0, 10]} label={{ value: 'Arm Feel', angle: 90, position: 'insideRight' }}/>
                        <Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none' }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="sleep" name="Sleep" fill="#8884d8" />
                        <Line yAxisId="right" type="monotone" dataKey="armFeel" name="Arm Feel" stroke="#82ca9d" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

function Dashboard({ player, coachId, appId }) {
    const [liftingLogs, setLiftingLogs] = useState([]);
    const [throwingLogs, setThrowingLogs] = useState([]);
    const [insight, setInsight] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        if (!player) return;
        const logsCollectionRef = collection(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/logs`);
        const q = query(logsCollectionRef, orderBy('date', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const liftData = [];
            const throwData = [];
            snapshot.forEach(doc => {
                const log = doc.data();
                if (log.type === 'lift') liftData.push(log);
                else if (log.type === 'throw') throwData.push(log);
            });
            setLiftingLogs(liftData);
            setThrowingLogs(throwData);
        });
        return () => unsubscribe();
    }, [player, coachId, appId]);

    const generateInsight = async () => {
        setIsGenerating(true);
        setInsight('');
        const prompt = `Analyze the following recent workout data for a baseball player named ${player.name}. Lifting logs (exercise, weight, reps): ${JSON.stringify(liftingLogs.slice(0, 5))}. Throwing logs (arm feel out of 10): ${JSON.stringify(throwingLogs.slice(0, 5))}. Provide a one-sentence insight for the coach.`;
        try {
            const result = await callGeminiAPI({ contents: [{ parts: [{ text: prompt }] }] });
            setInsight(result.candidates[0].content.parts[0].text.trim());
        } catch (error) {
            setInsight("Could not generate an insight at this time.");
        } finally {
            setIsGenerating(false);
        }
    };
    
    const squatData = liftingLogs.filter(log => log.exercise.toLowerCase().includes('squat')).map(log => ({ date: log.date, weight: log.weight })).sort((a,b) => new Date(a.date) - new Date(b.date));
    const throwingFeelData = throwingLogs.map(log => ({ date: log.date, feel: log.feel })).sort((a,b) => new Date(a.date) - new Date(b.date));

    return (
        <div className="space-y-8">
            <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-blue-300">AI Performance Insight</h3>
                    <button onClick={generateInsight} disabled={isGenerating} className="bg-purple-600 hover:bg-purple-700 text-white p-2 rounded text-sm transition-colors disabled:bg-gray-500">{isGenerating ? '✨ Analyzing...' : '✨ Get Insight'}</button>
                </div>
                {insight && <p className="text-purple-300 italic">{insight}</p>}
            </div>
            <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-300">Squat Progress (lbs)</h3>
                    {squatData.length > 0 ? <ResponsiveContainer width="100%" height={300}><LineChart data={squatData}><CartesianGrid strokeDasharray="3 3" stroke="#4a5568" /><XAxis dataKey="date" stroke="#a0aec0" /><YAxis stroke="#a0aec0" domain={['dataMin - 20', 'dataMax + 20']}/><Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none' }} /><Line type="monotone" dataKey="weight" stroke="#4299e1" strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="text-gray-400">No squat data logged yet.</p>}
                </div>
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-semibold mb-4 text-blue-300">Throwing Arm Feel (1-10)</h3>
                    {throwingFeelData.length > 0 ? <ResponsiveContainer width="100%" height={300}><LineChart data={throwingFeelData}><CartesianGrid strokeDasharray="3 3" stroke="#4a5568" /><XAxis dataKey="date" stroke="#a0aec0" /><YAxis stroke="#a0aec0" domain={[0, 10]} /><Tooltip contentStyle={{ backgroundColor: '#2d3748', border: 'none' }} /><Line type="monotone" dataKey="feel" stroke="#63b3ed" strokeWidth={2} /></LineChart></ResponsiveContainer> : <p className="text-gray-400">No throwing data logged yet.</p>}
                </div>
            </div>
        </div>
    );
}

function DailyQuestionnaire({ player, coachId, appId }) {
    const [formData, setFormData] = useState({
        overallFeel: 5, armFeel: 5, shoulderFeel: 5, backFeel: 5, legsFeel: 5,
        sleepHours: 8, hitCalories: 'Yes', hitProtein: 'Yes', notes: ''
    });

    const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        const log = { type: 'wellness', date: new Date().toISOString().split('T')[0], ...formData };
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/logs`), log);
            alert("Daily wellness log submitted!");
        } catch (error) {
            alert("Failed to submit log.");
        }
    };

    const Slider = ({ name, label, value }) => (
        <div>
            <label htmlFor={name} className="block mb-1 text-sm">{label}: <span className="font-bold text-green-400">{value}</span></label>
            <input type="range" id={name} name={name} min="1" max="10" value={value} onChange={handleChange} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"/>
        </div>
    );

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-6 text-center">Daily Wellness Log</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Slider name="overallFeel" label="Overall Feeling" value={formData.overallFeel} />
                <Slider name="armFeel" label="Arm Feeling" value={formData.armFeel} />
                <Slider name="shoulderFeel" label="Shoulder Feeling" value={formData.shoulderFeel} />
                <Slider name="backFeel" label="Back Feeling" value={formData.backFeel} />
                <Slider name="legsFeel" label="Legs Feeling" value={formData.legsFeel} />
                <div><label htmlFor="sleepHours" className="block mb-1 text-sm">Hours of Sleep</label><input type="number" id="sleepHours" name="sleepHours" value={formData.sleepHours} onChange={handleChange} className="bg-gray-700 p-2 rounded w-full"/></div>
                <div className="grid grid-cols-2 gap-4">
                    <div><label className="block mb-1 text-sm">Hit Calorie Goal?</label><select name="hitCalories" value={formData.hitCalories} onChange={handleChange} className="bg-gray-700 p-2 rounded w-full"><option>Yes</option><option>No</option></select></div>
                    <div><label className="block mb-1 text-sm">Hit Protein Goal?</label><select name="hitProtein" value={formData.hitProtein} onChange={handleChange} className="bg-gray-700 p-2 rounded w-full"><option>Yes</option><option>No</option></select></div>
                </div>
                <div><label htmlFor="notes" className="block mb-1 text-sm">Notes</label><textarea id="notes" name="notes" value={formData.notes} onChange={handleChange} rows="3" className="bg-gray-700 p-2 rounded w-full"></textarea></div>
                <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors">Submit Today's Log</button>
            </form>
        </div>
    );
}

function ThrowingProgram({ player, coachId, appId, isPlayerView }) {
    const [program, setProgram] = useState([]);
    const [todayLog, setTodayLog] = useState({});
    const programDocRef = doc(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/programs/throwing`);

    useEffect(() => {
        const unsubscribe = onSnapshot(programDocRef, (doc) => {
            if (doc.exists() && doc.data().program) {
                setProgram(doc.data().program);
            } else {
                setProgram([{ day: 1, focus: 'Velocity', sections: [{ title: 'Warm-up', drills: [{ name: 'J-Bands', sets: 2, reps: 15, url: '' }] }] }]);
            }
        });
        return () => unsubscribe();
    }, [player.id, coachId, appId]);

    const handleFocusChange = (dayIndex, value) => { const newProgram = [...program]; newProgram[dayIndex].focus = value; setProgram(newProgram); };
    const handleSectionTitleChange = (dayIndex, secIndex, value) => { const newProgram = [...program]; newProgram[dayIndex].sections[secIndex].title = value; setProgram(newProgram); };
    const handleDrillChange = (dayIndex, secIndex, drillIndex, field, value) => { const newProgram = [...program]; newProgram[dayIndex].sections[secIndex].drills[drillIndex][field] = value; setProgram(newProgram); };
    const addDay = () => setProgram([...program, { day: program.length + 1, focus: 'New Day', sections: [] }]);
    const deleteDay = (dayIndex) => setProgram(program.filter((_, i) => i !== dayIndex));
    const addSection = (dayIndex) => { const newProgram = [...program]; newProgram[dayIndex].sections.push({ title: 'New Section', drills: [] }); setProgram(newProgram); };
    const deleteSection = (dayIndex, secIndex) => { const newProgram = [...program]; newProgram[dayIndex].sections = newProgram[dayIndex].sections.filter((_, i) => i !== secIndex); setProgram(newProgram); };
    const addDrill = (dayIndex, secIndex) => { const newProgram = [...program]; newProgram[dayIndex].sections[secIndex].drills.push({ name: '', sets: '', reps: '', url: '' }); setProgram(newProgram); };
    const deleteDrill = (dayIndex, secIndex, drillIndex) => { const newProgram = [...program]; newProgram[dayIndex].sections[secIndex].drills = newProgram[dayIndex].sections[secIndex].drills.filter((_, i) => i !== drillIndex); setProgram(newProgram); };
    
    const saveProgram = async () => {
        try { await setDoc(programDocRef, { program }); alert('Throwing program saved!'); }
        catch (error) { alert('Failed to save program.'); }
    };
    
    const logThrowingSession = async (day) => {
        if (!todayLog[day.day] || !todayLog[day.day].feel) { alert("Please enter your arm feel."); return; }
        const log = { type: 'throw', date: new Date().toISOString().split('T')[0], day: day.day, focus: day.focus, feel: Number(todayLog[day.day].feel) };
        try {
            await addDoc(collection(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/logs`), log);
            alert(`Day ${day.day} session logged!`);
        } catch (error) { alert("Failed to log session."); }
    };

    return (
        <div className="space-y-6">
            {program.map((day, dayIndex) => (
                <div key={dayIndex} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        {isPlayerView ? <h3 className="text-xl font-semibold text-blue-300">Day {day.day}: {day.focus}</h3> : <div className="flex items-center gap-2"><span className="text-xl font-semibold">Day {day.day}:</span><input type="text" value={day.focus} onChange={e => handleFocusChange(dayIndex, e.target.value)} className="bg-gray-700 p-2 rounded text-xl font-semibold text-blue-300"/></div>}
                        {isPlayerView ? <div className="flex items-center gap-2"><span>Arm Feel (1-10):</span><input type="number" min="1" max="10" onChange={(e) => setTodayLog({...todayLog, [day.day]: {feel: e.target.value}})} placeholder="-" className="bg-gray-600 p-1 rounded w-16"/><button onClick={() => logThrowingSession(day)} className="bg-green-600 hover:bg-green-700 text-white p-1 px-2 rounded text-xs">Log</button></div> : <button onClick={() => deleteDay(dayIndex)} className="text-red-500 hover:text-red-400">Delete Day</button>}
                    </div>
                    {day.sections.map((section, secIndex) => (
                        <div key={secIndex} className="p-4 border border-gray-700 rounded-lg mb-4">
                            <div className="flex justify-between items-center mb-2">
                                {isPlayerView ? <h4 className="font-semibold text-lg">{section.title}</h4> : <input type="text" value={section.title} onChange={e => handleSectionTitleChange(dayIndex, secIndex, e.target.value)} className="bg-gray-700 p-1 rounded font-semibold text-lg"/>}
                                {!isPlayerView && <button onClick={() => deleteSection(dayIndex, secIndex)} className="text-red-500 hover:text-red-400 text-xs">Remove Section</button>}
                            </div>
                            {section.drills.map((drill, drillIndex) => (
                                <div key={drillIndex} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center mb-1 text-sm">
                                    {isPlayerView ? <div className="md:col-span-2">{drill.name}</div> : <input type="text" value={drill.name} onChange={e => handleDrillChange(dayIndex, secIndex, drillIndex, 'name', e.target.value)} placeholder="Drill Name" className="bg-gray-600 p-1 rounded md:col-span-2"/>}
                                    {isPlayerView ? <div>{drill.sets} sets</div> : <input type="text" value={drill.sets} onChange={e => handleDrillChange(dayIndex, secIndex, drillIndex, 'sets', e.target.value)} placeholder="Sets" className="bg-gray-600 p-1 rounded"/>}
                                    {isPlayerView ? <div>{drill.reps} reps</div> : <input type="text" value={drill.reps} onChange={e => handleDrillChange(dayIndex, secIndex, drillIndex, 'reps', e.target.value)} placeholder="Reps" className="bg-gray-600 p-1 rounded"/>}
                                    {isPlayerView ? <div>{drill.url && <a href={drill.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">(Watch Video)</a>}</div> : <div className="flex items-center gap-1"><input type="text" value={drill.url} onChange={e => handleDrillChange(dayIndex, secIndex, drillIndex, 'url', e.target.value)} placeholder="YouTube URL" className="bg-gray-600 p-1 rounded w-full"/><button onClick={() => deleteDrill(dayIndex, secIndex, drillIndex)} className="text-red-500 hover:text-red-400">X</button></div>}
                                </div>
                            ))}
                            {!isPlayerView && <button onClick={() => addDrill(dayIndex, secIndex)} className="text-xs mt-2 text-blue-400 hover:text-blue-300">+ Add Drill</button>}
                        </div>
                    ))}
                     {!isPlayerView && <button onClick={() => addSection(dayIndex)} className="text-sm mt-2 text-blue-400 hover:text-blue-300">+ Add Section</button>}
                </div>
            ))}
            {!isPlayerView && <div className="mt-6 flex gap-4"><button onClick={addDay} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Add Day</button><button onClick={saveProgram} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">Save Throwing Program</button></div>}
        </div>
    );
}

function LiftingProgram({ player, coachId, appId, isPlayerView }) {
    const [split, setSplit] = useState({});
    const [todayLog, setTodayLog] = useState({});
    const programDocRef = doc(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/programs/lifting`);

    useEffect(() => {
        const unsubscribe = onSnapshot(programDocRef, (doc) => {
            if (doc.exists() && doc.data().split) {
                setSplit(doc.data().split);
            } else {
                setSplit({ day1: { name: 'New Workout Day', exercises: [] } });
            }
        });
        return () => unsubscribe();
    }, [player.id, coachId, appId]);

    const handleDayNameChange = (dayKey, newName) => setSplit({...split, [dayKey]: {...split[dayKey], name: newName}});
    const handleExerciseChange = (dayKey, exIndex, field, value) => { const newSplit = { ...split }; newSplit[dayKey].exercises[exIndex][field] = value; setSplit(newSplit); };
    const addDay = () => { const newDayKey = `day${Object.keys(split).length + 1}`; setSplit({...split, [newDayKey]: { name: 'New Workout Day', exercises: [] }}); };
    const deleteDay = (dayKey) => { const newSplit = {...split}; delete newSplit[dayKey]; setSplit(newSplit); };
    const addExercise = (dayKey) => { const newSplit = { ...split }; newSplit[dayKey].exercises.push({ name: '', sets: '', reps: '', videoUrl: '' }); setSplit(newSplit); };
    const deleteExercise = (dayKey, exIndex) => { const newSplit = { ...split }; newSplit[dayKey].exercises = newSplit[dayKey].exercises.filter((_, i) => i !== exIndex); setSplit(newSplit); };
    
    const saveProgram = async () => {
        try { await setDoc(programDocRef, { split }); alert('Lifting program saved!'); }
        catch (error) { alert('Failed to save program.'); }
    };

    const logLiftingSession = async (dayKey) => {
        const dayLog = todayLog[dayKey];
        if (!dayLog) { alert("No data entered to log."); return; }
        const batch = writeBatch(db);
        const date = new Date().toISOString().split('T')[0];
        Object.keys(dayLog).forEach(exIndex => {
            const { weight, reps } = dayLog[exIndex];
            const exerciseInfo = split[dayKey].exercises[exIndex];
            const log = { type: 'lift', date, dayName: split[dayKey].name, exercise: exerciseInfo.name, weight: Number(weight || 0), reps: Number(reps || 0) };
            const newLogRef = doc(collection(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/logs`));
            batch.set(newLogRef, log);
        });
        try { await batch.commit(); alert("Workout logged successfully!"); }
        catch (error) { alert("Failed to log workout."); }
    };

    return (
        <div className="space-y-6">
            {Object.keys(split).map(dayKey => (
                <div key={dayKey} className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        {isPlayerView ? <h3 className="text-xl font-semibold text-blue-300">{split[dayKey].name}</h3> : <input type="text" value={split[dayKey].name} onChange={e => handleDayNameChange(dayKey, e.target.value)} className="bg-gray-700 p-2 rounded text-xl font-semibold text-blue-300"/>}
                        {!isPlayerView && <button onClick={() => deleteDay(dayKey)} className="text-red-500 hover:text-red-400">Delete Day</button>}
                    </div>
                    {split[dayKey].exercises.map((ex, exIndex) => (
                        <div key={exIndex} className="grid grid-cols-1 md:grid-cols-5 gap-2 items-center mb-2">
                            {isPlayerView ? <div className="font-semibold md:col-span-2 flex items-center gap-2">{ex.name}{ex.videoUrl && <a href={ex.videoUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 text-xs">(Watch Video)</a>}</div> : <React.Fragment><input type="text" value={ex.name} onChange={e => handleExerciseChange(dayKey, exIndex, 'name', e.target.value)} placeholder="Exercise" className="bg-gray-700 p-1 rounded"/><input type="text" value={ex.videoUrl} onChange={e => handleExerciseChange(dayKey, exIndex, 'videoUrl', e.target.value)} placeholder="YouTube URL" className="bg-gray-700 p-1 rounded text-sm"/></React.Fragment>}
                            {isPlayerView ? <div className="text-center">{ex.sets} sets</div> : <input type="text" value={ex.sets} onChange={e => handleExerciseChange(dayKey, exIndex, 'sets', e.target.value)} placeholder="Sets" className="bg-gray-700 p-1 rounded"/>}
                            {isPlayerView ? <div className="text-center">{ex.reps} reps</div> : <input type="text" value={ex.reps} onChange={e => handleExerciseChange(dayKey, exIndex, 'reps', e.target.value)} placeholder="Reps" className="bg-gray-700 p-1 rounded"/>}
                            {isPlayerView ? <div className="flex gap-2 items-center"><input type="number" placeholder="lbs" onChange={(e) => setTodayLog({...todayLog, [dayKey]: {...todayLog[dayKey], [exIndex]: {...todayLog[dayKey]?.[exIndex], weight: e.target.value}}})} className="bg-gray-600 p-1 rounded w-full"/><input type="number" placeholder="reps" onChange={(e) => setTodayLog({...todayLog, [dayKey]: {...todayLog[dayKey], [exIndex]: {...todayLog[dayKey]?.[exIndex], reps: e.target.value}}})} className="bg-gray-600 p-1 rounded w-full"/></div> : <button onClick={() => deleteExercise(dayKey, exIndex)} className="text-red-500 hover:text-red-400 text-center">X</button>}
                        </div>
                    ))}
                    {isPlayerView ? <button onClick={() => logLiftingSession(dayKey)} className="mt-4 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors">Log This Workout</button> : <button onClick={() => addExercise(dayKey)} className="mt-4 text-sm text-blue-400 hover:text-blue-300">+ Add Exercise</button>}
                </div>
            ))}
            {!isPlayerView && <div className="mt-6 flex gap-4"><button onClick={addDay} className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded">Add Workout Day</button><button onClick={saveProgram} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded">Save Lifting Program</button></div>}
        </div>
    );
}

function NutritionCalculator({ player, coachId, appId }) {
    const [weight, setWeight] = useState(170);
    const [goal, setGoal] = useState(0.5);
    const [activity, setActivity] = useState(1.6);
    const [caloriesBurned, setCaloriesBurned] = useState(300);

    const docRef = doc(db, `artifacts/${appId}/users/${coachId}/players/${player.id}/programs/nutrition`);
    
    useEffect(() => {
        const getNutrition = async () => {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setWeight(data.weight || 170);
                setGoal(data.goal || 0.5);
                setActivity(data.activity || 1.6);
                setCaloriesBurned(data.caloriesBurned || 300);
            }
        };
        if(player?.id && coachId && appId) getNutrition();
    }, [player.id, coachId, appId]);
    
    const saveNutrition = async () => {
        try {
            await setDoc(docRef, { weight, goal, activity, caloriesBurned });
            alert("Nutrition goals saved!");
        } catch(e) {
            alert("Failed to save goals.");
        }
    }

    const maintenance = Math.round(weight * 10 * activity);
    const surplus = goal * 500;
    const targetCalories = maintenance + caloriesBurned + surplus;
    const targetProtein = Math.round(weight * 1);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-2xl mx-auto">
            <h3 className="text-xl font-semibold mb-4 text-blue-300">Daily Nutrition Calculator</h3>
            <div className="space-y-4">
                <div><label className="block mb-1 text-sm">Current Weight (lbs)</label><input type="number" value={weight} onChange={e => setWeight(Number(e.target.value))} className="bg-gray-700 p-2 rounded w-full"/></div>
                <div><label className="block mb-1 text-sm">Weekly Weight Gain Goal (lbs)</label><select value={goal} onChange={e => setGoal(Number(e.target.value))} className="bg-gray-700 p-2 rounded w-full"><option value={0.5}>0.5 lbs (Slow Bulk)</option><option value={1.0}>1.0 lbs (Fast Bulk)</option></select></div>
                <div><label className="block mb-1 text-sm">Activity Level</label><select value={activity} onChange={e => setActivity(Number(e.target.value))} className="bg-gray-700 p-2 rounded w-full"><option value={1.4}>Light</option><option value={1.6}>Active</option><option value={1.8}>Very Active</option></select></div>
                <div><label className="block mb-1 text-sm">Avg. Calories Burned During Workout</label><input type="number" value={caloriesBurned} onChange={e => setCaloriesBurned(Number(e.target.value))} className="bg-gray-700 p-2 rounded w-full"/></div>
            </div>
            <div className="mt-6 border-t border-gray-700 pt-4 space-y-2">
                <h4 className="text-lg font-semibold">Your Daily Targets:</h4>
                <p>Target Daily Calories: <span className="font-bold text-blue-400">{targetCalories}</span></p>
                <p>Target Daily Protein (g): <span className="font-bold text-blue-400">{targetProtein}</span></p>
            </div>
            <button onClick={saveNutrition} className="w-full mt-6 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded transition-colors">Save Goals</button>
        </div>
    );
}

function MessagingCenter({ player, coachId, appId, senderName }) {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const messagesEndRef = useRef(null);
    const [analysis, setAnalysis] = useState({});
    const [analyzing, setAnalyzing] = useState(null);
    const messagesCollectionRef = collection(db, `artifacts/${appId}/public/data/messages`);
    
    useEffect(() => {
        if (!player?.id || !coachId || coachId === 'default-coach') return;
        const q = query(messagesCollectionRef, where('participants', 'array-contains', coachId));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const msgs = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.participants.includes(player.id)) { msgs.push({ id: doc.id, ...data }); }
            });
            msgs.sort((a, b) => (a.timestamp?.toMillis() || 0) - (b.timestamp?.toMillis() || 0));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [player, coachId, appId]);

    useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
    
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        const storageRef = ref(storage, `messages/${appId}/${player.id}/${Date.now()}-${file.name}`);
        try {
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await addDoc(messagesCollectionRef, { type: 'video', mediaUrl: downloadURL, senderId: auth.currentUser.uid, senderName: senderName, participants: [coachId, player.id], timestamp: serverTimestamp() });
        } catch (error) {
            console.error("Error uploading file: ", error);
            alert("File upload failed.");
        } finally {
            setUploading(false);
        }
    };

    const analyzeVideo = async (msgId, videoUrl) => {
        setAnalyzing(msgId);
        const prompt = `A baseball coach has received a video of a player's pitching mechanics. Provide a short, 2-point analysis focusing on potential areas for improvement. For example, mention head movement or front-side stability.`;
        try {
            const result = await callGeminiAPI({ contents: [{ parts: [{ text: prompt }] }] });
            setAnalysis({...analysis, [msgId]: result.candidates[0].content.parts[0].text.trim() });
        } catch (error) {
            setAnalysis({...analysis, [msgId]: "Could not analyze video." });
        } finally {
            setAnalyzing(null);
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' || !player?.id) return;
        const senderId = auth.currentUser ? auth.currentUser.uid : 'unknown';
        await addDoc(messagesCollectionRef, { type: 'text', text: newMessage, senderId: senderId, senderName: senderName, participants: [coachId, player.id], timestamp: serverTimestamp() });
        setNewMessage('');
    };

    return (
        <div className="bg-gray-800 rounded-lg shadow-lg h-[70vh] flex flex-col">
            <div className="p-4 border-b border-gray-700"><h3 className="text-xl font-semibold text-blue-300">Chat with {senderName === "Coach" ? player.name : "Coach"}</h3></div>
            <div className="flex-1 p-4 overflow-y-auto">{messages.map(msg => (<div key={msg.id} className={`flex mb-4 ${msg.senderId === auth.currentUser?.uid ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-lg max-w-xs lg:max-w-md ${msg.senderId === auth.currentUser?.uid ? 'bg-blue-600' : 'bg-gray-600'}`}>
                    {msg.type === 'video' ? (
                        <div>
                            <video controls src={msg.mediaUrl} className="rounded-lg max-w-full"></video>
                            {senderName === 'Coach' && (
                                <div className="mt-2">
                                    <button onClick={() => analyzeVideo(msg.id, msg.mediaUrl)} disabled={analyzing === msg.id} className="text-xs w-full bg-purple-600 hover:bg-purple-700 rounded p-1">{analyzing === msg.id ? 'Analyzing...' : 'AI Form Analysis'}</button>
                                    {analysis[msg.id] && <p className="text-xs mt-2 p-2 bg-gray-900 rounded">{analysis[msg.id]}</p>}
                                </div>
                            )}
                        </div>
                    ) : <p className="text-sm">{msg.text}</p>}
                    <p className="text-xs text-gray-400 mt-1 text-right">{msg.senderName}</p>
                </div>
            </div>))}<div ref={messagesEndRef} /></div>
            <div className="p-4 border-t border-gray-700">
                {uploading && <p className="text-center text-sm text-blue-300 mb-2">Uploading video...</p>}
                <form onSubmit={sendMessage} className="flex gap-2">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="video/*" className="hidden"/>
                    <button type="button" onClick={() => fileInputRef.current.click()} className="bg-gray-600 p-2 rounded hover:bg-gray-700">📎</button>
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="flex-1 bg-gray-700 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                    <button type="submit" className="bg-blue-500 p-2 rounded-md hover:bg-blue-600">Send</button>
                </form>
            </div>
        </div>
    );
}

function DrillLibrary({ coachId, appId, isPlayerView = false }) {
    const [drills, setDrills] = useState([]);
    const [newDrill, setNewDrill] = useState({ name: '', category: 'Hitting', videoUrl: '' });
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);
    const [filter, setFilter] = useState('All');

    const libraryRef = collection(db, `artifacts/${appId}/public/data/drillLibrary`);

    useEffect(() => {
        const q = query(libraryRef, orderBy('category'));
        const unsubscribe = onSnapshot(q, snap => {
            setDrills(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [appId]);

    const handleUploadDrill = async (e) => {
        const file = e.target.files[0];
        if (!file || !newDrill.name || !newDrill.category) {
            alert("Please provide a drill name and category before uploading a video.");
            return;
        }
        setUploading(true);
        const storageRef = ref(storage, `drillLibrary/${appId}/${Date.now()}-${file.name}`);
        try {
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            await addDoc(libraryRef, { ...newDrill, videoUrl: downloadURL, createdAt: serverTimestamp() });
            setNewDrill({ name: '', category: 'Hitting', videoUrl: '' });
        } catch (error) {
            console.error("Error uploading drill: ", error);
            alert("Drill upload failed.");
        } finally {
            setUploading(false);
        }
    };
    
    const filteredDrills = drills.filter(d => filter === 'All' || d.category === filter);

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-blue-300">Video Drill Library</h3>
            {!isPlayerView && (
                <div className="bg-gray-700 p-4 rounded-lg mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                    <input type="text" value={newDrill.name} onChange={e => setNewDrill({...newDrill, name: e.target.value})} placeholder="Drill Name" className="bg-gray-600 p-2 rounded"/>
                    <select value={newDrill.category} onChange={e => setNewDrill({...newDrill, category: e.target.value})} className="bg-gray-600 p-2 rounded">
                        <option>Hitting</option><option>Pitching</option><option>Fielding</option><option>Baserunning</option><option>Mobility</option>
                    </select>
                    <input type="file" ref={fileInputRef} onChange={handleUploadDrill} accept="video/*" className="hidden"/>
                    <button onClick={() => fileInputRef.current.click()} disabled={uploading} className="bg-blue-500 p-2 rounded hover:bg-blue-600 col-span-2">{uploading ? 'Uploading...' : 'Upload New Drill Video'}</button>
                </div>
            )}
            <div className="flex gap-2 mb-4">
                {['All', 'Hitting', 'Pitching', 'Fielding', 'Baserunning', 'Mobility'].map(cat => <button key={cat} onClick={() => setFilter(cat)} className={`px-3 py-1 rounded text-sm ${filter === cat ? 'bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>{cat}</button>)}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[60vh] overflow-y-auto">
                {filteredDrills.map(drill => (
                    <div key={drill.id} className="bg-gray-700 rounded-lg overflow-hidden">
                        <video controls src={drill.videoUrl} className="w-full h-40 object-cover"></video>
                        <div className="p-3">
                            <h4 className="font-semibold">{drill.name}</h4>
                            <p className="text-xs text-gray-400">{drill.category}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
            
            const container = document.getElementById('root');
            const root = ReactDOM.createRoot(container);
            root.render(<App />);
}

        window.addEventListener('load', startApp);
    </script>
</body>
</html>
