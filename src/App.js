import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDocs, onSnapshot, updateDoc, setDoc, query, where, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { Plus, Music, ListMusic, Trash2, Save, Link as LinkIcon, Pencil, XCircle, ArrowUp, ArrowDown, Sun, Moon, ZoomIn, ZoomOut, LogOut, UserPlus, KeyRound, ShieldCheck, UserCog, Users } from 'lucide-react';

// --- CONFIGURACIÓN DE FIREBASE ---
const firebaseConfig = {
  apiKey: process.env.REACT_APP_API_KEY,
  authDomain: process.env.REACT_APP_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_PROJECT_ID,
  storageBucket: process.env.REACT_APP_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_APP_ID
};
const appId = firebaseConfig.projectId || 'default-app-id';

// --- LÓGICA DE TRANSPOSICIÓN DE ACORDES ---
const notesSharp = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const notesFlat = ['A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab'];

const getNoteIndex = (note) => {
    let index = notesSharp.indexOf(note);
    if (index !== -1) return index;
    return notesFlat.indexOf(note);
};

const transposeChord = (chord, amount) => {
    if (!chord) return '';
    const match = chord.match(/([A-G][#b]?)(.*)/);
    if (!match) return chord;
    const root = match[1];
    const rest = match[2];
    const rootIndex = getNoteIndex(root);
    if (rootIndex === -1) return chord;
    const newIndex = (rootIndex + amount + 12) % 12;
    const newRoot = notesSharp[newIndex];
    return newRoot + rest;
};

const transposeSongContent = (content, amount) => {
    if (!content) return '';
    if (amount === 0) return content;
    return content.replace(/\[([^\]]+)\]/g, (match, chord) => `[${transposeChord(chord, amount)}]`);
};

const getOriginalKey = (content) => {
    if (!content) return 'C';
    const match = content.match(/\[([^\]]+)\]/);
    if (!match) return 'C';
    const firstChordRoot = match[1].match(/([A-G][#b]?)/);
    return firstChordRoot ? firstChordRoot[1] : 'C';
};

// --- COMPONENTE DE AUTENTICACIÓN ---
function AuthPage({ auth, db }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [invitationCode, setInvitationCode] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');

    const handleRegister = async () => {
        setError('');
        try {
            const invitationsRef = collection(db, `/artifacts/${appId}/invitations`);
            const q = query(invitationsRef, where("code", "==", invitationCode), where("status", "==", "active"));
            const querySnapshot = await getDocs(q);
            if (querySnapshot.empty) {
                setError("Código de invitación inválido o ya utilizado.");
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            const batch = writeBatch(db);

            // Crear el documento del usuario
            const userDocRef = doc(db, `/artifacts/${appId}/users`, user.uid);
            batch.set(userDocRef, { email: user.email, role: 'guest' });

            // Marcar la invitación como usada en lugar de borrarla
            querySnapshot.forEach(invitationDoc => {
                batch.update(invitationDoc.ref, { status: 'used', usedBy: user.uid, usedAt: new Date() });
            });

            await batch.commit();

        } catch (err) {
            setError("Error de Firebase: " + err.code);
        }
    };

    const handleLogin = async () => {
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError("Error de Firebase: " + err.code);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (isLogin) handleLogin();
        else handleRegister();
    };

    return (
        <div className="flex items-center justify-center h-screen bg-gray-800">
            <div className="w-full max-w-md p-8 space-y-8 bg-gray-900 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-center text-white">{isLogin ? 'Iniciar Sesión' : 'Crear Cuenta'}</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" required className="w-full px-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" required className="w-full px-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                    {!isLogin && (<input type="text" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value)} placeholder="Código de Invitación" required className="w-full px-4 py-2 text-white bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>)}
                    <button type="submit" className="w-full px-4 py-2 font-bold text-white bg-cyan-600 rounded-md hover:bg-cyan-700">{isLogin ? 'Entrar' : 'Registrarse'}</button>
                    {error && <p className="text-sm text-red-400 text-center">{error}</p>}
                </form>
                <button onClick={() => setIsLogin(!isLogin)} className="w-full text-sm text-center text-cyan-400 hover:underline">{isLogin ? '¿No tenés cuenta? Creá una' : '¿Ya tenés cuenta? Inicia sesión'}</button>
            </div>
        </div>
    );
}

// --- COMPONENTE PRINCIPAL DE LA APLICACIÓN ---
export default function App() {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [songs, setSongs] = useState([]);
    const [privateSetlists, setPrivateSetlists] = useState([]);
    const [publicSetlists, setPublicSetlists] = useState([]);
    const [invitations, setInvitations] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [selectedSong, setSelectedSong] = useState(null);
    const [transposeOffset, setTransposeOffset] = useState(0);
    const [targetKeyInput, setTargetKeyInput] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [newSongTitle, setNewSongTitle] = useState('');
    const [newSongArtist, setNewSongArtist] = useState('');
    const [newSongContent, setNewSongContent] = useState('');
    const [newPrivateSetlistName, setNewPrivateSetlistName] = useState('');
    const [newPublicSetlistName, setNewPublicSetlistName] = useState('');
    const [songNotes, setSongNotes] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedArtist, setEditedArtist] = useState('');
    const [editedContent, setEditedContent] = useState('');
    const [theme, setTheme] = useState('dark');
    const [fontSizeIndex, setFontSizeIndex] = useState(2);
    const fontSizes = ['text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            setDb(firestore);
            setAuth(authInstance);
            const unsubscribe = onAuthStateChanged(authInstance, async (authUser) => {
                if (authUser) {
                    const userDocRef = doc(firestore, `/artifacts/${appId}/users`, authUser.uid);
                    const userDocSnap = await getDoc(userDocRef);
                    if (userDocSnap.exists()) setUser({ ...authUser, ...userDocSnap.data() });
                    else setUser(authUser); 
                } else setUser(null);
                setIsLoading(false);
            });
            return () => unsubscribe();
        } catch (error) { 
            console.error("Error inicializando Firebase:", error);
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!user || !db) {
            setSongs([]); setPrivateSetlists([]); setPublicSetlists([]); setInvitations([]); setAllUsers([]);
            return;
        };
        const songsCollectionPath = `/artifacts/${appId}/songs`;
        const qSongs = query(collection(db, songsCollectionPath));
        const unsubscribeSongs = onSnapshot(qSongs, (snap) => setSongs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const privateSetlistsPath = `/artifacts/${appId}/users/${user.uid}/setlists`;
        const qPrivateSetlists = query(collection(db, privateSetlistsPath));
        const unsubPrivate = onSnapshot(qPrivateSetlists, (snap) => setPrivateSetlists(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const publicSetlistsPath = `/artifacts/${appId}/public_setlists`;
        const qPublicSetlists = query(collection(db, publicSetlistsPath));
        const unsubPublic = onSnapshot(qPublicSetlists, (snap) => setPublicSetlists(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        let unsubInvitations = () => {}, unsubUsers = () => {};
        if (user.role === 'admin') {
            const invitationsCollectionPath = `/artifacts/${appId}/invitations`;
            unsubInvitations = onSnapshot(query(collection(db, invitationsCollectionPath)), (snap) => setInvitations(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
            const usersCollectionPath = `/artifacts/${appId}/users`;
            unsubUsers = onSnapshot(query(collection(db, usersCollectionPath)), (snap) => setAllUsers(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        }

        return () => { unsubscribeSongs(); unsubPrivate(); unsubPublic(); unsubInvitations(); unsubUsers(); };
    }, [user, db]);

    const handleGenerateInvitation = async () => {
        if (!db) return;
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        await addDoc(collection(db, `/artifacts/${appId}/invitations`), { code: code, createdAt: new Date(), status: 'active' });
    };
    const handleDeleteInvitation = async (invitationId) => {
        if (!db) return;
        await deleteDoc(doc(db, `/artifacts/${appId}/invitations`, invitationId));
    };
    const handleUpdateUserRole = async (targetUserId, newRole) => {
        if (!db || user.uid === targetUserId) return;
        await updateDoc(doc(db, `/artifacts/${appId}/users`, targetUserId), { role: newRole });
    };
    const handleAddSong = async (e) => {
        e.preventDefault();
        if (!newSongTitle || !newSongContent || !db || !user) return;
        await addDoc(collection(db, `/artifacts/${appId}/songs`), { title: newSongTitle, artist: newSongArtist, content: newSongContent, notes: '' });
        setNewSongTitle('');
        setNewSongArtist('');
        setNewSongContent('');
    };
    const handleDeleteSong = async (songId) => {
        if (!db || !user || !songId) return;
        await deleteDoc(doc(db, `/artifacts/${appId}/songs/${songId}`));
        if(selectedSong?.id === songId) { setSelectedSong(null); setIsEditing(false); }
    };
    const handleSelectSong = (song, transposeOverride = null) => {
        const fullSong = songs.find(s => s.id === song.id);
        if(!fullSong) return;
        setSelectedSong(fullSong);
        setIsEditing(false);
        const newOffset = transposeOverride !== null ? transposeOverride : 0;
        setTransposeOffset(newOffset);
        setSongNotes(fullSong.notes || '');
        setTargetKeyInput(transposeChord(getOriginalKey(fullSong.content), newOffset));
    };
    const handleStartEdit = () => {
        if (!selectedSong) return;
        setIsEditing(true);
        setEditedTitle(selectedSong.title); setEditedArtist(selectedSong.artist); setEditedContent(selectedSong.content);
    };
    const handleCancelEdit = () => setIsEditing(false);
    const handleSaveChanges = async () => {
        if (!selectedSong || !db || !user) return;
        const songDocPath = `/artifacts/${appId}/songs/${selectedSong.id}`;
        const updatedData = { title: editedTitle, artist: editedArtist, content: editedContent };
        await updateDoc(doc(db, songDocPath), updatedData);
        setSelectedSong(prev => ({...prev, ...updatedData}));
        setIsEditing(false);
    };
    const handleUpdateSongNotes = async () => {
        if (!selectedSong || !db || !user) return;
        const songDocPath = `/artifacts/${appId}/songs/${selectedSong.id}`;
        await updateDoc(doc(db, songDocPath), { notes: songNotes });
        console.log("Notas guardadas!");
    };
    const handleAddSetlist = async (e, type) => {
        e.preventDefault();
        const name = type === 'private' ? newPrivateSetlistName : newPublicSetlistName;
        if (!name.trim() || !db || !user) return;
        const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists` : `/artifacts/${appId}/public_setlists`;
        await addDoc(collection(db, path), { name, songs: [] });
        if (type === 'private') setNewPrivateSetlistName('');
        else setNewPublicSetlistName('');
    };
    const handleDeleteSetlist = async (setlistId, type) => {
        if (!db || !user || !setlistId) return;
        const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists/${setlistId}` : `/artifacts/${appId}/public_setlists/${setlistId}`;
        await deleteDoc(doc(db, path));
    };
    const handleAddSongToSetlist = async (setlistId, type) => {
        if (!selectedSong || !db || !user) return;
        const setlist = (type === 'private' ? privateSetlists : publicSetlists).find(s => s.id === setlistId);
        if (setlist) {
            const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists/${setlistId}` : `/artifacts/${appId}/public_setlists/${setlistId}`;
            const updatedSongs = [...setlist.songs, { id: selectedSong.id, title: selectedSong.title, artist: selectedSong.artist, transpose: transposeOffset }];
            await updateDoc(doc(db, path), { songs: updatedSongs });
        }
    };
    const handleRemoveSongFromSetlist = async (setlistId, songIndex, type) => {
        const setlist = (type === 'private' ? privateSetlists : publicSetlists).find(s => s.id === setlistId);
        if (setlist) {
            const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists/${setlistId}` : `/artifacts/${appId}/public_setlists/${setlistId}`;
            const updatedSongs = setlist.songs.filter((_, index) => index !== songIndex);
            await updateDoc(doc(db, path), { songs: updatedSongs });
        }
    };
    const handleSetlistSongTranspose = async (setlistId, songIndex, step, type) => {
        const setlist = (type === 'private' ? privateSetlists : publicSetlists).find(s => s.id === setlistId);
        if (setlist) {
            const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists/${setlistId}` : `/artifacts/${appId}/public_setlists/${setlistId}`;
            const updatedSongs = [...setlist.songs];
            updatedSongs[songIndex].transpose += step;
            await updateDoc(doc(db, path), { songs: updatedSongs });
        }
    };
    const handleReorderSongInSetlist = async (setlistId, index, direction, type) => {
        const setlist = (type === 'private' ? privateSetlists : publicSetlists).find(s => s.id === setlistId);
        const newIndex = index + direction;
        if (setlist && newIndex >= 0 && newIndex < setlist.songs.length) {
            const path = type === 'private' ? `/artifacts/${appId}/users/${user.uid}/setlists/${setlistId}` : `/artifacts/${appId}/public_setlists/${setlistId}`;
            const updatedSongs = [...setlist.songs];
            [updatedSongs[index], updatedSongs[newIndex]] = [updatedSongs[newIndex], updatedSongs[index]];
            await updateDoc(doc(db, path), { songs: updatedSongs });
        }
    };
    const handleTransposeStep = (step) => {
        if (!selectedSong) return;
        const newOffset = transposeOffset + step;
        setTransposeOffset(newOffset);
        setTargetKeyInput(transposeChord(getOriginalKey(selectedSong.content), newOffset));
    };
    const handleApplyTargetKey = () => {
        if (!selectedSong || !targetKeyInput) return;
        const originalKeyIndex = getNoteIndex(getOriginalKey(selectedSong.content));
        const targetKeyIndex = getNoteIndex(targetKeyInput);
        if (originalKeyIndex !== -1 && targetKeyIndex !== -1) setTransposeOffset(targetKeyIndex - originalKeyIndex);
    };
    const changeFontSize = (direction) => {
        const newIndex = fontSizeIndex + direction;
        if (newIndex >= 0 && newIndex < fontSizes.length) {
            setFontSizeIndex(newIndex);
        }
    };

    const transposedContent = useMemo(() => selectedSong ? transposeSongContent(selectedSong.content, transposeOffset) : '', [selectedSong, transposeOffset]);

    if (isLoading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Cargando...</div>;
    if (!user) return <AuthPage auth={auth} db={db} />;

    const renderAsWebsiteStyle = (content) => {
        if (!content) return null;
        return content.split('\n').map((line, i) => {
            if (line.trim() === '') return <div key={i} className="h-4" />;
            const lyricContent = line.replace(/\[.*?\]/g, '').replace(/[-–—\s]/g, '');
            const hasLyrics = lyricContent.trim().length > 0;
            const hasChords = /\[.*?\]/.test(line);

            if (!hasChords) return <div key={i} className="mb-3"><p className="font-mono font-bold text-gray-500 dark:text-gray-400">{line}</p></div>;
            if (!hasLyrics && hasChords) {
                const chords = line.match(/\[.*?\]/g) || [];
                const chordsText = chords.map(c => c.slice(1, -1)).join('   ');
                return <div key={i} className="mb-3"><p className="font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-pre-wrap leading-tight">{chordsText}</p></div>;
            }
            let chordsDisplay = '', lyricsDisplay = '';
            const parts = line.split(/(\[[^\]]+\])/g).filter(Boolean);
            parts.forEach(part => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const chordText = part.slice(1, -1);
                    const padding = Math.max(0, lyricsDisplay.length - chordsDisplay.length);
                    chordsDisplay += ' '.repeat(padding) + chordText;
                } else {
                    lyricsDisplay += part;
                }
            });
            return (
                <div key={i} className="mb-3">
                    <p className="font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-pre-wrap leading-tight">{chordsDisplay}</p>
                    <p className="font-mono whitespace-pre-wrap leading-tight">{lyricsDisplay}</p>
                </div>
            );
        });
    };

    return (
        <div className={`${theme}`}>
        <div className="flex flex-col md:flex-row h-screen bg-white dark:bg-gray-800 text-gray-800 dark:text-white font-sans">
            <aside className="w-full md:w-1/3 lg:w-1/4 p-4 bg-gray-100 dark:bg-gray-900 overflow-y-auto flex flex-col space-y-6">
                <h1 className="text-2xl font-bold text-cyan-600 dark:text-cyan-400 text-center">Cancionero Digital</h1>
               <div className="flex items-center justify-between text-sm p-2 bg-gray-200 dark:bg-gray-800 rounded-lg">
                   <span className="truncate font-semibold">{user.email}</span>
                   <button onClick={() => signOut(auth)} className="flex items-center gap-2 p-2 rounded-md bg-red-500 text-white hover:bg-red-600 text-xs"><LogOut size={16}/> Salir</button>
               </div>
               <input type="text" placeholder="Buscar por título o artista..." className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
               <div className="flex-grow overflow-y-auto pr-2">
                   <h2 className="text-xl font-semibold mb-2 flex items-center"><Music className="mr-2" size={20} /> Repertorio</h2>
                   <ul className="space-y-1">{songs.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || (s.artist && s.artist.toLowerCase().includes(searchTerm.toLowerCase()))).map(song => (<li key={song.id} className={`flex justify-between items-center p-2 rounded cursor-pointer transition-colors ${selectedSong?.id === song.id ? 'bg-cyan-500 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => handleSelectSong(song)}><div><p className="font-semibold">{song.title}</p><p className="text-sm text-gray-500 dark:text-gray-400">{song.artist}</p></div>{user.role === 'admin' && <button onClick={(e) => {e.stopPropagation(); handleDeleteSong(song.id)}} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-1"><Trash2 size={16}/></button>}</li>))}</ul>
               </div>
               <div className="flex-shrink-0">
                   <h2 className="text-xl font-semibold mb-2 flex items-center"><ListMusic className="mr-2" size={20} /> Mis Listas</h2>
                   <form onSubmit={(e) => handleAddSetlist(e, 'private')} className="flex mb-2"><input type="text" value={newPrivateSetlistName} onChange={e => setNewPrivateSetlistName(e.target.value)} placeholder="Nueva lista personal..." className="flex-grow p-2 rounded-l bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"/><button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white p-2 rounded-r"><Plus size={20}/></button></form>
                   <div className="space-y-2 max-h-48 overflow-y-auto pr-2">{privateSetlists.map(setlist => (
                       <details key={setlist.id} className="bg-gray-200 dark:bg-gray-800 rounded p-2"><summary className="font-semibold cursor-pointer flex justify-between items-center">{setlist.name}<button onClick={(e) => {e.stopPropagation(); handleDeleteSetlist(setlist.id, 'private')}} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-1"><Trash2 size={16}/></button></summary>
                           <ul className="mt-2 pl-1 space-y-2 text-sm">{setlist.songs.map((song, index) => {
                               const originalSong = songs.find(s => s.id === song.id);
                               const originalKey = originalSong ? getOriginalKey(originalSong.content) : '?';
                               const targetKey = transposeChord(originalKey, song.transpose);
                               return (<li key={`${song.id}-${index}`} className="bg-gray-300 dark:bg-gray-700 p-2 rounded">
                                   <div className="flex justify-between items-center cursor-pointer" onClick={() => handleSelectSong(song, song.transpose)}>
                                       <span>{song.title}</span>
                                       <div className="flex items-center gap-2">
                                           <button onClick={(e) => {e.stopPropagation(); handleReorderSongInSetlist(setlist.id, index, -1, 'private')}} disabled={index===0} className="p-0.5 disabled:opacity-20"><ArrowUp size={14}/></button>
                                           <button onClick={(e) => {e.stopPropagation(); handleReorderSongInSetlist(setlist.id, index, 1, 'private')}} disabled={index===setlist.songs.length-1} className="p-0.5 disabled:opacity-20"><ArrowDown size={14}/></button>
                                           <button onClick={(e) => {e.stopPropagation(); handleRemoveSongFromSetlist(setlist.id, index, 'private')}} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-0.5"><Trash2 size={14}/></button>
                                       </div>
                                   </div>
                                   <div className="flex items-center justify-end gap-2 mt-1 text-xs">
                                       <span>Tono:</span>
                                       <button onClick={(e) => {e.stopPropagation(); handleSetlistSongTranspose(setlist.id, index, -1, 'private')}} className="bg-gray-400 dark:bg-gray-600 w-5 h-5 rounded">-</button>
                                       <span className="font-bold text-cyan-600 dark:text-cyan-400 w-5 text-center">{targetKey}</span>
                                       <button onClick={(e) => {e.stopPropagation(); handleSetlistSongTranspose(setlist.id, index, 1, 'private')}} className="bg-gray-400 dark:bg-gray-600 w-5 h-5 rounded">+</button>
                                   </div>
                               </li>);
                           })}</ul>
                       </details>
                   ))}</div>
               </div>
                {<div className="flex-shrink-0">
                   <h2 className="text-xl font-semibold mb-2 flex items-center"><Users className="mr-2" size={20} /> Listas de la Banda</h2>
                   {user.role === 'admin' && <form onSubmit={(e) => handleAddSetlist(e, 'public')} className="flex mb-2"><input type="text" value={newPublicSetlistName} onChange={e => setNewPublicSetlistName(e.target.value)} placeholder="Nueva lista pública..." className="flex-grow p-2 rounded-l bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"/><button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white p-2 rounded-r"><Plus size={20}/></button></form>}
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-2">{publicSetlists.map(setlist => (
                       <details key={setlist.id} className="bg-gray-200 dark:bg-gray-800 rounded p-2"><summary className="font-semibold cursor-pointer flex justify-between items-center">{setlist.name}{user.role === 'admin' && <button onClick={(e) => {e.stopPropagation(); handleDeleteSetlist(setlist.id, 'public')}} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-1"><Trash2 size={16}/></button>}</summary>
                           <ul className="mt-2 pl-1 space-y-2 text-sm">{setlist.songs.map((song, index) => {
                               const originalSong = songs.find(s => s.id === song.id);
                               const originalKey = originalSong ? getOriginalKey(originalSong.content) : '?';
                               const targetKey = transposeChord(originalKey, song.transpose);
                               return (<li key={`${song.id}-${index}`} className="bg-gray-300 dark:bg-gray-700 p-2 rounded">
                                   <div className="flex justify-between items-center cursor-pointer" onClick={() => handleSelectSong(song, song.transpose)}>
                                       <span>{song.title}</span>
                                       {user.role === 'admin' && <div className="flex items-center gap-2">
                                           <button onClick={(e) => {e.stopPropagation(); handleReorderSongInSetlist(setlist.id, index, -1, 'public')}} disabled={index===0} className="p-0.5 disabled:opacity-20"><ArrowUp size={14}/></button>
                                           <button onClick={(e) => {e.stopPropagation(); handleReorderSongInSetlist(setlist.id, index, 1, 'public')}} disabled={index===setlist.songs.length-1} className="p-0.5 disabled:opacity-20"><ArrowDown size={14}/></button>
                                           <button onClick={(e) => {e.stopPropagation(); handleRemoveSongFromSetlist(setlist.id, index, 'public')}} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-0.5"><Trash2 size={14}/></button>
                                       </div>}
                                   </div>
                                   <div className="flex items-center justify-end gap-2 mt-1 text-xs">
                                       <span>Tono:</span>
                                       {user.role === 'admin' ? (<>
                                       <button onClick={(e) => {e.stopPropagation(); handleSetlistSongTranspose(setlist.id, index, -1, 'public')}} className="bg-gray-400 dark:bg-gray-600 w-5 h-5 rounded">-</button>
                                       <span className="font-bold text-cyan-600 dark:text-cyan-400 w-5 text-center">{targetKey}</span>
                                       <button onClick={(e) => {e.stopPropagation(); handleSetlistSongTranspose(setlist.id, index, 1, 'public')}} className="bg-gray-400 dark:bg-gray-600 w-5 h-5 rounded">+</button>
                                       </>) : <span className="font-bold text-cyan-600 dark:text-cyan-400 w-5 text-center">{targetKey}</span>}
                                   </div>
                               </li>);
                           })}</ul>
                       </details>
                   ))}</div>
               </div>}

               {user.role === 'admin' && <details className="flex-shrink-0"><summary className="cursor-pointer text-lg font-semibold text-cyan-600 dark:text-cyan-400">Panel de Admin</summary>
                   <div className="mt-2 p-2 bg-gray-200 dark:bg-gray-800 rounded space-y-4">
                       <div>
                           <h3 className="font-bold mb-2 flex items-center"><UserPlus size={18} className="mr-2"/>Invitar Miembro</h3>
                           <button onClick={handleGenerateInvitation} className="w-full bg-green-500 hover:bg-green-600 text-white p-2 rounded font-bold text-sm">Generar Código de Invitación</button>
                           <ul className="mt-2 space-y-1 text-sm">{invitations.map(inv => (<li key={inv.id} className="flex justify-between items-center bg-gray-300 dark:bg-gray-700 p-2 rounded"><span className="font-mono">{inv.code}</span><button onClick={() => handleDeleteInvitation(inv.id)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-1"><Trash2 size={14}/></button></li>))}{invitations.length === 0 && <p className="text-xs text-gray-500">No hay códigos activos.</p>}</ul>
                       </div>
                       <div>
                          <h3 className="font-bold mb-2 flex items-center"><UserCog size={18} className="mr-2"/>Gestionar Usuarios</h3>
                          <ul className="space-y-1 text-sm">{allUsers.map(u => (<li key={u.id} className="flex justify-between items-center bg-gray-300 dark:bg-gray-700 p-2 rounded">
                              <div className="truncate"><p className="font-semibold">{u.email}</p><p className="text-xs">{u.role === 'admin' ? 'Administrador' : 'Invitado'}</p></div>
                              {user.uid !== u.id && (u.role === 'guest' ? <button onClick={() => handleUpdateUserRole(u.id, 'admin')} className="bg-blue-500 text-white text-xs px-2 py-1 rounded">Promover</button> : <button onClick={() => handleUpdateUserRole(u.id, 'guest')} className="bg-yellow-500 text-white text-xs px-2 py-1 rounded">Revocar</button>)}
                          </li>))}</ul>
                       </div>
                   </div>
               </details>}
               {user.role === 'admin' && <details className="flex-shrink-0"><summary className="cursor-pointer text-lg font-semibold text-cyan-600 dark:text-cyan-400">Añadir Nueva Canción</summary><form onSubmit={handleAddSong} className="space-y-2 mt-2"><input type="text" value={newSongTitle} onChange={e => setNewSongTitle(e.target.value)} placeholder="Título" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/><input type="text" value={newSongArtist} onChange={e => setNewSongArtist(e.target.value)} placeholder="Artista" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/><textarea value={newSongContent} onChange={e => setNewSongContent(e.target.value)} placeholder="Contenido en formato ChordPro..." rows="5" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-mono"></textarea><button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white p-2 rounded font-bold">Guardar Canción</button></form></details>}
           </aside>

           <main className="w-full md:w-2/3 lg:w-3/4 p-6 overflow-y-auto">
               {selectedSong ? (isEditing ? (
                   <div><h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">Editando Canción</h2><div className="space-y-4"><div><label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Título</label><input type="text" value={editedTitle} onChange={e => setEditedTitle(e.target.value)} className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/></div><div><label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Artista</label><input type="text" value={editedArtist} onChange={e => setEditedArtist(e.target.value)} className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/></div><div><label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Contenido (ChordPro)</label><textarea value={editedContent} onChange={e => setEditedContent(e.target.value)} rows="15" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-mono text-sm"></textarea></div><div className="flex space-x-4"><button onClick={handleSaveChanges} className="bg-green-500 hover:bg-green-600 text-white p-2 rounded font-bold flex items-center"><Save className="mr-2" size={18}/> Guardar Cambios</button><button onClick={handleCancelEdit} className="bg-gray-500 hover:bg-gray-600 text-white p-2 rounded font-bold flex items-center"><XCircle className="mr-2" size={18}/> Cancelar</button></div></div></div>
               ) : (
                   <div>
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                           <div><h2 className="text-4xl font-bold text-cyan-600 dark:text-cyan-400">{selectedSong.title}</h2><p className="text-xl text-gray-500 dark:text-gray-300">{selectedSong.artist}</p></div>
                           <div className="flex items-center flex-wrap gap-4 mt-4 sm:mt-0">
                               <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg">
                                   <button onClick={() => changeFontSize(-1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"><ZoomOut size={18}/></button>
                                   <button onClick={() => changeFontSize(1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"><ZoomIn size={18}/></button>
                               </div>
                               <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg"><span className="text-lg font-semibold">Tonalidad:</span><button onClick={() => handleTransposeStep(-1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold">-1</button><input type="text" value={targetKeyInput} onChange={(e) => setTargetKeyInput(e.target.value.toUpperCase())} onBlur={handleApplyTargetKey} className="w-16 p-2 text-center rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-bold text-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"/><button onClick={() => handleTransposeStep(1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold">+1</button></div>
                               {user.role === 'admin' && <button onClick={handleStartEdit} className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-lg font-bold flex items-center"><Pencil size={18}/></button>}
                               <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="bg-gray-200 dark:bg-gray-700 p-3 rounded-lg"><span className="dark:hidden"><Sun size={18}/></span><span className="hidden dark:inline"><Moon size={18}/></span></button>
                           </div>
                       </div>
                       <div className={`${fontSizes[fontSizeIndex]} leading-relaxed mb-8`}>{renderAsWebsiteStyle(transposedContent)}</div>
                       <div className="mb-8"><h3 className="text-xl font-semibold mb-2 flex items-center"><LinkIcon className="mr-2" size={20}/> Notas y Enlaces</h3><textarea value={songNotes} onChange={(e) => setSongNotes(e.target.value)} placeholder="Añade aquí el link de la versión que tocan, arreglos, etc." rows="4" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"></textarea><button onClick={handleUpdateSongNotes} className="mt-2 bg-blue-500 hover:bg-blue-600 text-white p-2 rounded font-bold flex items-center"><Save className="mr-2" size={18} /> Guardar Notas</button></div>
                       <div className="mb-8"><h3 className="text-xl font-semibold mb-2">Añadir a una lista:</h3><div className="flex flex-wrap gap-2">{privateSetlists.map(setlist => (<button key={setlist.id} onClick={() => handleAddSongToSetlist(setlist.id, 'private')} className="bg-indigo-700 hover:bg-indigo-800 text-white py-1 px-3 rounded-full text-sm">Personal: {setlist.name}</button>))} {user.role === 'admin' && publicSetlists.map(setlist => (<button key={setlist.id} onClick={() => handleAddSongToSetlist(setlist.id, 'public')} className="bg-cyan-700 hover:bg-cyan-800 text-white py-1 px-3 rounded-full text-sm">Banda: {setlist.name}</button>))}</div></div>
                   </div>
               )) : (
                   <div className="flex items-center justify-center h-full"><p className="text-2xl text-gray-400 dark:text-gray-500">Selecciona una canción para comenzar</p></div>
               )}
           </main>
       </div>
       </div>
   );
}