import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from 'firebase/auth';
import { getFirestore, collection, doc, addDoc, getDocs, onSnapshot, updateDoc, query, where, deleteDoc, getDoc, writeBatch } from 'firebase/firestore';
import { Plus, Music, ListMusic, Trash2, Save, Link as LinkIcon, Pencil, XCircle, ArrowUp, ArrowDown, Sun, Moon, ZoomIn, ZoomOut, LogOut, UserPlus, UserCog, Users, AlertTriangle} from 'lucide-react';

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
    // Detectar slash chord: Ejemplo G/B, D/F#, etc.
    const slashMatch = chord.match(/^([A-G][#b]?)([^/]*)\/([A-G][#b]?)(.*)$/);
    if (slashMatch) {
        // slashMatch[1]: raíz, slashMatch[2]: sufijo raíz, slashMatch[3]: bajo, slashMatch[4]: sufijo bajo
        const root = slashMatch[1];
        const rootSuffix = slashMatch[2] || '';
        const bass = slashMatch[3];
        const bassSuffix = slashMatch[4] || '';
        const rootIndex = getNoteIndex(root);
        const bassIndex = getNoteIndex(bass);
        const newRoot = rootIndex !== -1 ? notesSharp[(rootIndex + amount + 12) % 12] : root;
        const newBass = bassIndex !== -1 ? notesSharp[(bassIndex + amount + 12) % 12] : bass;
        return `${newRoot}${rootSuffix}/${newBass}${bassSuffix}`;
    }
    // Si no es slash chord, transponer normalmente
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
    // Prioridad 1: Buscar la directiva {key: ...} o {k: ...}
    const keyDirectiveMatch = content.match(/{key:\s*([^}]+)}/i) || content.match(/{k:\s*([^}]+)}/i);
    if (keyDirectiveMatch && keyDirectiveMatch[1]) {
        return keyDirectiveMatch[1].trim();
    }

    // Prioridad 2: Buscar el primer acorde en la canción
    const firstChordMatch = content.match(/\[([^\]]+)\]/);
    if (firstChordMatch && firstChordMatch[1]) {
        const firstChordRootMatch = firstChordMatch[1].match(/([A-G][#b]?)/);
        if (firstChordRootMatch && firstChordRootMatch[1]) {
            return firstChordRootMatch[1];
        }
    }
    
    // Si no se encuentra nada, devolver 'C' como valor por defecto
    return 'C';
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
            
            const userDocRef = doc(db, `/artifacts/${appId}/users`, user.uid);
            batch.set(userDocRef, { email: user.email, role: 'guest' });
            
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
    const [editedContentNotes, setEditedContentNotes] = useState('');
    const [editedContentPiano, setEditedContentPiano] = useState('');
    const [activeContentTab, setActiveContentTab] = useState('main'); // 'main', 'notes', 'piano'
    const [theme, setTheme] = useState('dark');
    const [fontSizeIndex, setFontSizeIndex] = useState(2);
    const [bookModeEnabled, setBookModeEnabled] = useState(false);
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
        // Consulta modificada para excluir canciones borradas lógicamente
        const qSongs = query(
            collection(db, songsCollectionPath), 
            where("deletedAt", "==", null)
        );
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
        await addDoc(collection(db, `/artifacts/${appId}/songs`), { 
            title: newSongTitle, 
            artist: newSongArtist, 
            content: newSongContent, 
            content_notes: '', // Versión simplificada con solo notas y acordes
            content_piano: '', // Versión específica para piano
            notes: '',
            deletedAt: null // Nuevo campo para borrado lógico
        });
        setNewSongTitle('');
        setNewSongArtist('');
        setNewSongContent('');
    };
    // Función para iniciar el proceso de eliminación - muestra el diálogo de confirmación
    const startDeleteSong = (songId, e) => {
        // Evitar que el evento se propague (importante para evitar seleccionar la canción al hacer clic en el botón de eliminar)
        if (e) {
            e.stopPropagation();
        }
        
        setPendingDeleteSongId(songId);
        setShowDeleteConfirmation(true);
    };
    
    // Función para cancelar la eliminación
    const cancelDeleteSong = () => {
        setPendingDeleteSongId(null);
        setShowDeleteConfirmation(false);
    };
    
    // Función de eliminación lógica
    const handleDeleteSong = async () => {
        if (!db || !user || !pendingDeleteSongId) return;
        
        // Borrado lógico - actualizamos el campo deletedAt en lugar de eliminar
        await updateDoc(doc(db, `/artifacts/${appId}/songs/${pendingDeleteSongId}`), {
            deletedAt: new Date()
        });
        
        // Si la canción borrada estaba seleccionada, limpiamos la selección
        if(selectedSong?.id === pendingDeleteSongId) { 
            setSelectedSong(null); 
            setIsEditing(false); 
        }
        
        // Limpiamos el estado de confirmación
        setPendingDeleteSongId(null);
        setShowDeleteConfirmation(false);
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
        setEditedTitle(selectedSong.title); 
        setEditedArtist(selectedSong.artist); 
        setEditedContent(selectedSong.content);
        // Cargamos los contenidos adicionales si existen, si no, inicializamos con string vacío
        setEditedContentNotes(selectedSong.content_notes || '');
        setEditedContentPiano(selectedSong.content_piano || '');
        // Empezamos siempre en la pestaña principal
        setActiveContentTab('main');
    };
    const handleCancelEdit = () => setIsEditing(false);
    const handleSaveChanges = async () => {
        if (!selectedSong || !db || !user) return;
        const songDocPath = `/artifacts/${appId}/songs/${selectedSong.id}`;
        const updatedData = { 
            title: editedTitle, 
            artist: editedArtist, 
            content: editedContent,
            content_notes: editedContentNotes,
            content_piano: editedContentPiano
        };
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
    const handleTransposeStep = useCallback((step) => {
        if (!selectedSong) return;
        const newOffset = transposeOffset + step;
        setTransposeOffset(newOffset);
        setTargetKeyInput(transposeChord(getOriginalKey(selectedSong.content), newOffset));
    }, [selectedSong, transposeOffset]);
    
    const handleApplyTargetKey = useCallback(() => {
        if (!selectedSong || !targetKeyInput) return;
        const originalKeyIndex = getNoteIndex(getOriginalKey(selectedSong.content));
        const targetKeyIndex = getNoteIndex(targetKeyInput);
        if (originalKeyIndex !== -1 && targetKeyIndex !== -1) setTransposeOffset(targetKeyIndex - originalKeyIndex);
    }, [selectedSong, targetKeyInput]);
    
    const changeFontSize = useCallback((direction) => {
        const newIndex = fontSizeIndex + direction;
        if (newIndex >= 0 && newIndex < fontSizes.length) {
            setFontSizeIndex(newIndex);
        }
    }, [fontSizeIndex, fontSizes.length]);

    // Estado para controlar qué versión de la canción se muestra
    const [displayVersion, setDisplayVersion] = useState('main'); // 'main', 'notes', 'piano'
    
    // Estados para confirmación de eliminación
    const [pendingDeleteSongId, setPendingDeleteSongId] = useState(null);
    const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
    
    // Auto-scroll state and functions
    const [isAutoScrolling, setIsAutoScrolling] = useState(false);
    const [scrollSpeed, setScrollSpeed] = useState(2); // Velocidad inicial más alta para ser perceptible
    const autoScrollRef = React.useRef(null);
    const mainContentRef = React.useRef(null); // Referencia al contenedor principal de la canción

    // Referencia para el valor actual de scrollSpeed para usarlo en el intervalo
    const scrollSpeedRef = React.useRef(1);
    
    // Mantener sincronizada la referencia con el estado
    useEffect(() => {
        scrollSpeedRef.current = scrollSpeed;
    }, [scrollSpeed]);
    
    // Detectar si estamos en un dispositivo táctil (como iPad)
    useEffect(() => {
        const detectTouchDevice = () => {
            const isTouchDevice = 
                ('ontouchstart' in window) || 
                (navigator.maxTouchPoints > 0) || 
                (navigator.msMaxTouchPoints > 0);
            
            // Configurar el modo de scroll apropiado para dispositivos táctiles
            if (isTouchDevice) {
                document.documentElement.style.overscrollBehaviorY = 'contain';
                if (mainContentRef.current) {
                    mainContentRef.current.style.WebkitOverflowScrolling = 'touch';
                }
            }
        };
        
        detectTouchDevice();
        
        // Algunos dispositivos pueden cambiar en tiempo de ejecución
        window.addEventListener('resize', detectTouchDevice);
        return () => window.removeEventListener('resize', detectTouchDevice);
    }, []);

    const startAutoScroll = useCallback(() => {
        console.log("Iniciando auto-scroll - IMPLEMENTACIÓN ULTRA SIMPLIFICADA");
        
        // Primero limpiamos cualquier intervalo anterior
        if (autoScrollRef.current) {
            clearInterval(autoScrollRef.current);
            autoScrollRef.current = null;
        }
        
        // Verificación super básica del contenedor
        if (!mainContentRef.current) {
            console.error("ERROR: No existe el contenedor para auto-scroll");
            alert("Error iniciando auto-scroll: No se encontró el contenedor");
            return;
        }
        
        // Activamos el estado de auto-scroll
        setIsAutoScrolling(true);
        
        // Mover un poco al inicio para demostrar que funciona
        console.log("Forzando scroll inicial de prueba");
        mainContentRef.current.scrollBy(0, 10);
        
        // Verificación extremadamente simple: ¿hay contenido suficiente?
        const containerHeight = mainContentRef.current.clientHeight;
        const contentHeight = mainContentRef.current.scrollHeight;
        
        console.log("AUTO-SCROLL DEBUG - DIMENSIONES:", { 
            containerHeight, 
            contentHeight,
            diferencia: contentHeight - containerHeight,
            posicionActual: mainContentRef.current.scrollTop
        });
        
        if (contentHeight <= containerHeight) {
            console.warn("ADVERTENCIA: No hay contenido suficiente para hacer scroll");
            alert("No hay suficiente contenido para auto-scroll");
            setIsAutoScrolling(false);
            return;
        }
        
        // Definir función simple de desplazamiento que será llamada periódicamente
        const doScroll = () => {
            if (!mainContentRef.current) return false;
            
            // Obtenemos dimensiones actuales
            const containerHeight = mainContentRef.current.clientHeight;
            const contentHeight = mainContentRef.current.scrollHeight;
            const scrollTop = mainContentRef.current.scrollTop;
            
            // Verificamos si hemos llegado al final
            if (scrollTop + containerHeight >= contentHeight - 20) {
                console.log("AUTO-SCROLL: Fin del contenido alcanzado");
                setIsAutoScrolling(false);
                return false;
            }
            
            // Aplicamos un movimiento fijo según la velocidad
            const pixelsToMove = Math.max(1, scrollSpeed);
            
            try {
                // Intentamos mover directamente con scrollBy
                mainContentRef.current.scrollBy({
                    top: pixelsToMove,
                    left: 0,
                    behavior: 'auto'
                });
                
                // Verificación redundante para asegurarnos de que se mueve
                setTimeout(() => {
                    if (mainContentRef.current) {
                        mainContentRef.current.scrollTop += pixelsToMove / 2;
                    }
                }, 5);
                
                // Log para depuración
                console.log("Auto-scroll aplicado:", pixelsToMove);
            } catch (e) {
                console.error("Error en auto-scroll:", e);
                // Fallback directo a scrollTop
                try {
                    mainContentRef.current.scrollTop += pixelsToMove;
                } catch (err) {
                    console.error("Error crítico en auto-scroll:", err);
                    return false;
                }
            }
            
            return true;
        };
        
        // Crear el intervalo de auto-scroll con un periodo más largo y simple
        autoScrollRef.current = setInterval(() => {
            if (!doScroll()) {
                console.log("Deteniendo auto-scroll desde intervalo");
                clearInterval(autoScrollRef.current);
                autoScrollRef.current = null;
                setIsAutoScrolling(false);
            }
        }, 100); // 100ms = 10 veces por segundo, suficiente y más seguro
        
        // Intentar un primer scroll para verificar funcionamiento
        doScroll();
        
    }, [scrollSpeed, setIsAutoScrolling]);

    const stopAutoScroll = useCallback(() => {
        console.log("Deteniendo auto-scroll - SIMPLIFICADO");
        
        // Limpiamos el intervalo de scroll
        if (autoScrollRef.current) {
            clearInterval(autoScrollRef.current);
            autoScrollRef.current = null;
        }
        
        // Forzamos el estado a false para actualizar la UI
        setIsAutoScrolling(false);
        
        // Cancelamos cualquier animación pendiente por si acaso
        if (window.cancelAnimationFrame) {
            window.cancelAnimationFrame(window.requestAnimationFrame(() => {}));
        }
        
        console.log("Auto-scroll detenido completamente");
    }, []);

    const changeScrollSpeed = useCallback((amount) => {
        // Versión simplificada con valores más amplios para mayor efecto
        setScrollSpeed(prev => {
            // Aumentamos el rango para que sea más notorio
            const newValue = Math.max(0.5, Math.min(10, prev + amount));
            // Redondeamos a 1 decimal para mayor simplicidad
            return Math.round(newValue * 10) / 10;
        });
        
        console.log("Velocidad de scroll cambiada");
    }, []);

    // Cleanup auto-scroll interval on component unmount
    useEffect(() => {
        return () => {
            if (autoScrollRef.current) {
                clearInterval(autoScrollRef.current);
                autoScrollRef.current = null;
            }
        };
    }, []);
    
    // Reset auto-scroll when we change songs
    useEffect(() => {
        // Detener el auto-scroll cuando cambiamos de canción
        if (autoScrollRef.current) {
            clearInterval(autoScrollRef.current);
            autoScrollRef.current = null;
            setIsAutoScrolling(false);
        }
        // También asegurémonos de volver al inicio del contenido
        if (mainContentRef.current) {
            try {
                // Método moderno de scroll con opciones
                mainContentRef.current.scrollTo({
                    top: 0,
                    behavior: 'auto'
                });
            } catch (e) {
                // Fallback para navegadores antiguos
                mainContentRef.current.scrollTop = 0;
            }
        }
    }, [selectedSong]);
    
    // Configuración especial para iPad y dispositivos iOS
    useEffect(() => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        
        if (isIOS && mainContentRef.current) {
            // Guardamos una referencia al elemento para usarla en la limpieza
            const contentElement = mainContentRef.current;
            
            // Aplicamos configuraciones específicas solo al contenedor de la canción
            // en lugar de a todo el documento para evitar afectar la navegación general
            contentElement.style.overscrollBehavior = 'contain';
            contentElement.style.WebkitOverflowScrolling = 'touch';
            
            // Ya no fijamos la posición del body para permitir scrolling normal
            // en otras partes de la aplicación
            
            return () => {
                // Usamos la variable capturada para la limpieza
                contentElement.style.overscrollBehavior = '';
                contentElement.style.WebkitOverflowScrolling = '';
            };
        }
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Función para verificar si el elemento es un input o elemento editable
            const isInputElement = (element) => {
                return element.tagName === 'INPUT' || 
                       element.tagName === 'TEXTAREA' || 
                       element.isContentEditable;
            };
            
            // Solo manejar atajos de teclado cuando hay una canción seleccionada,
            // no estamos editando y el foco NO está en un elemento de entrada
            if (!selectedSong || isEditing || isInputElement(document.activeElement)) return;

            switch (e.key) {
                case 'b': 
                    // Toggle book mode
                    setBookModeEnabled(prev => !prev);
                    break;
                case '+':
                case '=':
                    // Transpose up
                    handleTransposeStep(1);
                    break;
                case '-':
                    // Transpose down
                    handleTransposeStep(-1);
                    break;
                case 's':
                    // Toggle auto-scroll
                    console.log("Tecla 's' presionada - Estado auto-scroll:", isAutoScrolling);
                    if (isAutoScrolling) {
                        console.log("Deteniendo auto-scroll desde atajo de teclado");
                        stopAutoScroll();
                    } else {
                        console.log("Iniciando auto-scroll desde atajo de teclado");
                        setTimeout(() => {
                            // Pequeño retardo para asegurar que la UI se ha actualizado
                            startAutoScroll();
                        }, 50);
                    }
                    e.preventDefault();
                    break;
                case 'ArrowUp':
                    if (isAutoScrolling) {
                        // Decrease scroll speed (incremento más pequeño)
                        changeScrollSpeed(-0.1);
                    } else {
                        // Zoom in
                        changeFontSize(1);
                    }
                    e.preventDefault();
                    break;
                    
                // Teclas para cambiar entre versiones
                case '1':
                    if (selectedSong) {
                        setDisplayVersion('main');
                    }
                    break;
                case '2':
                    if (selectedSong?.content_notes) {
                        setDisplayVersion('notes');
                    }
                    break;
                case '3':
                    if (selectedSong?.content_piano) {
                        setDisplayVersion('piano');
                    }
                    break;
                case 'ArrowDown':
                    if (isAutoScrolling) {
                        // Increase scroll speed (incremento más pequeño)
                        changeScrollSpeed(0.1);
                    } else {
                        // Zoom out
                        changeFontSize(-1);
                    }
                    e.preventDefault();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        selectedSong, 
        isEditing, 
        isAutoScrolling, 
        handleTransposeStep,
        changeFontSize,
        startAutoScroll,
        stopAutoScroll,
        changeScrollSpeed
    ]);

    // Seleccionar el contenido correcto según la versión activa
    const selectedContent = useMemo(() => {
        if (!selectedSong) return '';
        
        switch(displayVersion) {
            case 'notes':
                return selectedSong.content_notes || '';
            case 'piano':
                return selectedSong.content_piano || '';
            default: // 'main'
                return selectedSong.content;
        }
    }, [selectedSong, displayVersion]);
    
    // Transponer el contenido seleccionado
    const transposedContent = useMemo(
        () => selectedSong ? transposeSongContent(selectedContent, transposeOffset) : '', 
        [selectedSong, selectedContent, transposeOffset]
    );

    if (isLoading) return <div className="flex items-center justify-center h-screen bg-gray-900 text-white">Cargando...</div>;
    if (!user) return <AuthPage auth={auth} db={db} />;

    const renderAsWebsiteStyle = (content) => {
        if (!content) return null;
        const lines = content.split('\n').map((line, i) => {
            if (line.trim() === '') return <div key={i} className="h-4" />;
            const lyricContent = line.replace(/\[.*?\]/g, '').replace(/[-–—\s]/g, '');
            const hasLyrics = lyricContent.trim().length > 0;
            const hasChords = /\[.*?\]/.test(line);

            if (!hasChords) return <div key={i} className="mb-3"><p className="font-mono font-bold text-gray-500 dark:text-gray-400">{line}</p></div>;
            if (!hasLyrics && hasChords) {
                // Menor separación entre acordes para líneas solo de acordes (ej: intro)
                const chords = line.match(/\[.*?\]/g) || [];
                let chordsText = '';
                const pad = 4; // separador reducido a 4 espacios
                chords.forEach((c, idx) => {
                    const chordStr = c.slice(1, -1);
                    chordsText += chordStr;
                    if (idx < chords.length - 1) {
                        chordsText += ' '.repeat(pad);
                    }
                });
                return <div key={i} className="mb-3"><p className="font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-pre leading-tight">{chordsText}</p></div>;
            }
            let chordsDisplay = '', lyricsDisplay = '';
            const parts = line.split(/(\[[^\]]+\])/g).filter(Boolean);
            parts.forEach((part, idx) => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    const chordText = part.slice(1, -1);
                    // Si el acorde está en un espacio vacío o al final, agregar padding extra
                    const prevLyric = idx > 0 ? parts[idx - 1] : '';
                    const nextLyric = idx < parts.length - 1 ? parts[idx + 1] : '';
                    let padding = Math.max(0, lyricsDisplay.length - chordsDisplay.length);
                    // Si el acorde está al final o rodeado de espacios vacíos, agregar menos espacio
                    if ((nextLyric === '' || nextLyric === undefined) || (/^\s*$/.test(prevLyric) && /^\s*$/.test(nextLyric))) {
                        padding += 2; // padding extra reducido para acordes "sueltos"
                    }
                    chordsDisplay += ' '.repeat(padding) + chordText;
                } else {
                    lyricsDisplay += part;
                }
            });
            return (
                <div key={i} className="mb-3">
                    <p className="font-mono font-bold text-cyan-600 dark:text-cyan-400 whitespace-pre leading-tight">{chordsDisplay}</p>
                    <p className="font-mono whitespace-pre-wrap leading-tight">{lyricsDisplay}</p>
                </div>
            );
        });
        
        // Si el modo libro está activado, dividir el contenido en dos columnas
        if (bookModeEnabled && lines.length > 10) {
            const midPoint = Math.ceil(lines.length / 2);
            const leftColumn = lines.slice(0, midPoint);
            const rightColumn = lines.slice(midPoint);
            
            return (
                <>
                    <div className="w-1/2">{leftColumn}</div>
                    <div className="w-1/2">{rightColumn}</div>
                </>
            );
        }
        
        // Modo normal - una columna
        return <div className="single-column">{lines}</div>;
    };

    // CSS para el modo libro y scroll
    const appStyles = `
        main {
            height: 100vh; /* Asegurar que el contenedor principal ocupe toda la altura */
            overflow-y: auto !important;
            scroll-behavior: auto; /* Cambiado de smooth a auto para mejor compatibilidad */
            position: relative;
            display: flex;
            flex-direction: column;
            padding-bottom: 50px; /* Espacio adicional al final para evitar que se corte */
            -webkit-overflow-scrolling: touch; /* Para mejor scroll en iOS */
            overscroll-behavior-y: contain; /* Prevenir scroll refresh en dispositivos táctiles */
            touch-action: pan-y; /* Permitir scrolling táctil vertical */
            isolation: isolate; /* Crear un contexto de apilamiento independiente */
        }
        
        /* Contenedor principal de la canción con scroll */
        .song-content-container {
            flex: 1;
            height: auto; /* Altura automática basada en el contenido */
            min-height: 78vh; /* Aumentamos la altura mínima para dar más espacio a la canción */
            max-height: 90vh; /* Permitir que ocupe casi toda la pantalla */
            overflow-y: auto !important; /* Forzar overflow */
            overflow-x: hidden;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior: contain;
            scroll-behavior: auto; /* Auto en lugar de smooth */
            padding: 12px 8px; /* Padding aún más reducido */
            position: relative;
            border: none; /* Sin borde */
            margin-bottom: 0.5rem; /* Menos espacio abajo */
        }
        
        /* Evitar que se oculte el scroll del contenedor principal */
        main::-webkit-scrollbar {
            width: 10px;
        }
        
        main::-webkit-scrollbar-track {
            background: rgba(0,0,0,0.1);
            border-radius: 5px;
        }
        
        main::-webkit-scrollbar-thumb {
            background: rgba(0,0,0,0.2);
            border-radius: 5px;
        }
        
        .book-mode {
            display: flex;
            flex-direction: row;
            gap: 2rem;
            margin-bottom: 2rem;
            max-height: 70vh;
            overflow-y: hidden !important;
        }
        
        .book-mode > div {
            flex: 1;
            overflow-y: auto;
            padding-right: 1rem;
            margin-bottom: 2rem;
            height: 70vh;
        }

        .single-column {
            width: 100%;
            min-height: 30vh;
        }
        
        /* Resaltar controles activos */
        .active-control {
            background-color: #0891b2;
            color: white;
        }
        
        /* Estilo para los atajos de teclado */
        kbd {
            font-family: monospace;
            border: 1px solid #ccc;
            border-radius: 3px;
            padding: 1px 3px;
            margin: 0 2px;
        }

        /* Indicador de auto-scroll */
        .auto-scrolling-indicator {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: rgba(8, 145, 178, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 4px;
            font-size: 0.8rem;
            z-index: 100;
        }

        @media (max-width: 768px) {
            .book-mode {
                flex-direction: column;
                max-height: none;
                overflow-y: visible !important;
            }
            
            .book-mode > div {
                width: 100% !important;
                height: auto;
            }
        }
    `;

    return (
        <div className={`${theme}`}>
        <style>{appStyles}</style>
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
                   <ul className="space-y-1">{songs.filter(s => s.title.toLowerCase().includes(searchTerm.toLowerCase()) || (s.artist && s.artist.toLowerCase().includes(searchTerm.toLowerCase()))).map(song => (<li key={song.id} className={`flex justify-between items-center p-2 rounded cursor-pointer transition-colors ${selectedSong?.id === song.id ? 'bg-cyan-500 text-white' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`} onClick={() => handleSelectSong(song)}><div><p className="font-semibold">{song.title}</p><p className="text-sm text-gray-500 dark:text-gray-400">{song.artist}</p></div>{user.role === 'admin' && <button onClick={(e) => startDeleteSong(song.id, e)} className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-600 p-1"><Trash2 size={16}/></button>}</li>))}</ul>
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
                   <div>
                       <h2 className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">Editando Canción</h2>
                       <div className="space-y-4">
                           <div>
                               <label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Título</label>
                               <input type="text" value={editedTitle} onChange={e => setEditedTitle(e.target.value)} className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/>
                           </div>
                           <div>
                               <label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Artista</label>
                               <input type="text" value={editedArtist} onChange={e => setEditedArtist(e.target.value)} className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600"/>
                           </div>
                           
                           {/* Tabs para los diferentes tipos de contenido */}
                           <div className="mb-2">
                               <div className="flex border-b border-gray-200 dark:border-gray-700">
                                   <button 
                                       onClick={() => setActiveContentTab('main')} 
                                       className={`py-2 px-4 font-medium ${activeContentTab === 'main' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400' : 'text-gray-500 dark:text-gray-400'}`}
                                   >
                                       Versión Principal
                                   </button>
                                   <button 
                                       onClick={() => setActiveContentTab('notes')} 
                                       className={`py-2 px-4 font-medium ${activeContentTab === 'notes' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400' : 'text-gray-500 dark:text-gray-400'}`}
                                   >
                                       Versión Notas
                                   </button>
                                   <button 
                                       onClick={() => setActiveContentTab('piano')} 
                                       className={`py-2 px-4 font-medium ${activeContentTab === 'piano' ? 'text-cyan-600 dark:text-cyan-400 border-b-2 border-cyan-600 dark:border-cyan-400' : 'text-gray-500 dark:text-gray-400'}`}
                                   >
                                       Versión Piano
                                   </button>
                               </div>
                               <div className="mt-2">
                                   {activeContentTab === 'main' && (
                                       <div>
                                           <label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">Contenido Principal (ChordPro)</label>
                                           <textarea value={editedContent} onChange={e => setEditedContent(e.target.value)} rows="15" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-mono text-sm"></textarea>
                                       </div>
                                   )}
                                   {activeContentTab === 'notes' && (
                                       <div>
                                           <label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">
                                               Versión Notas (ChordPro) - Simplificada con solo acordes/notas
                                           </label>
                                           <textarea value={editedContentNotes} onChange={e => setEditedContentNotes(e.target.value)} rows="15" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-mono text-sm"></textarea>
                                       </div>
                                   )}
                                   {activeContentTab === 'piano' && (
                                       <div>
                                           <label className="block text-sm font-bold mb-1 text-gray-600 dark:text-gray-300">
                                               Versión Piano (ChordPro) - Arreglos específicos para piano
                                           </label>
                                           <textarea value={editedContentPiano} onChange={e => setEditedContentPiano(e.target.value)} rows="15" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-mono text-sm"></textarea>
                                       </div>
                                   )}
                               </div>
                           </div>
                           
                           <div className="flex space-x-4">
                               <button onClick={handleSaveChanges} className="bg-green-500 hover:bg-green-600 text-white p-2 rounded font-bold flex items-center">
                                   <Save className="mr-2" size={18}/> Guardar Cambios
                               </button>
                               <button onClick={handleCancelEdit} className="bg-gray-500 hover:bg-gray-600 text-white p-2 rounded font-bold flex items-center">
                                   <XCircle className="mr-2" size={18}/> Cancelar
                               </button>
                           </div>
                       </div>
                   </div>
               ) : (
                   <div>
                       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                           <div><h2 className="text-4xl font-bold text-cyan-600 dark:text-cyan-400">{selectedSong.title}</h2><p className="text-xl text-gray-500 dark:text-gray-300">{selectedSong.artist}</p></div>
                           <div className="flex items-center flex-wrap gap-4 mt-4 sm:mt-0">
                               <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg">
                                   <button onClick={() => changeFontSize(-1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600" title="Reducir tamaño (tecla ↓)"><ZoomOut size={18}/></button>
                                   <button onClick={() => changeFontSize(1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600" title="Aumentar tamaño (tecla ↑)"><ZoomIn size={18}/></button>
                               </div>
                               <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg"><span className="text-lg font-semibold">Tono:</span><button onClick={() => handleTransposeStep(-1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold" title="Bajar tono (tecla -)">-1</button><input type="text" value={targetKeyInput} onChange={(e) => setTargetKeyInput(e.target.value.toUpperCase())} onBlur={handleApplyTargetKey} className="w-16 p-2 text-center rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 font-bold text-xl focus:outline-none focus:ring-2 focus:ring-cyan-500"/><button onClick={() => handleTransposeStep(1)} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 font-bold" title="Subir tono (tecla +)">+1</button></div>
                               
                               {/* Selector de versión de la canción */}
                               {(selectedSong?.content_notes || selectedSong?.content_piano) && (
                                   <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-900 p-2 rounded-lg">
                                       <span className="text-lg font-semibold">Versión:</span>
                                       <div className="flex bg-gray-200 dark:bg-gray-700 rounded-md overflow-hidden">
                                           <button 
                                               onClick={() => setDisplayVersion('main')}
                                               className={`px-3 py-1 text-sm font-medium flex items-center gap-1 ${displayVersion === 'main' ? 'bg-cyan-600 text-white' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                                               title="Versión principal"
                                           >
                                               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                   <path d="M9 18V5l12-2v13"></path>
                                                   <circle cx="6" cy="18" r="3"></circle>
                                                   <circle cx="18" cy="16" r="3"></circle>
                                               </svg>
                                               Principal
                                           </button>
                                           {selectedSong?.content_notes && (
                                               <button 
                                                   onClick={() => setDisplayVersion('notes')}
                                                   className={`px-3 py-1 text-sm font-medium flex items-center gap-1 ${displayVersion === 'notes' ? 'bg-cyan-600 text-white' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                                                   title="Solo notas y acordes"
                                               >
                                                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                       <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                                       <line x1="9" y1="3" x2="9" y2="21"></line>
                                                   </svg>
                                                   Notas
                                               </button>
                                           )}
                                           {selectedSong?.content_piano && (
                                               <button 
                                                   onClick={() => setDisplayVersion('piano')}
                                                   className={`px-3 py-1 text-sm font-medium flex items-center gap-1 ${displayVersion === 'piano' ? 'bg-cyan-600 text-white' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}
                                                   title="Arreglo para piano"
                                               >
                                                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                       <path d="M16 4H8a6 6 0 0 0 0 12h8a6 6 0 0 0 0-12z"></path>
                                                       <path d="M8 16v4"></path>
                                                       <path d="M16 16v4"></path>
                                                       <path d="M12 4v16"></path>
                                                   </svg>
                                                   Piano
                                               </button>
                                           )}
                                       </div>
                                   </div>
                               )}
                               
                               {/* Control Auto-Scroll */}
                               <div className={`flex items-center gap-2 p-2 rounded-lg ${isAutoScrolling ? 'bg-cyan-600 text-white' : 'bg-gray-100 dark:bg-gray-900'}`}>
                                   {!isAutoScrolling ? (
                                       <button 
                                           onClick={(e) => {
                                               e.preventDefault();
                                               e.stopPropagation();
                                               startAutoScroll();
                                           }}
                                           className="flex items-center gap-1 p-2 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600" 
                                           title="Iniciar Auto-scroll (tecla S)">
                                           <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                               <polyline points="7 13 12 18 17 13"></polyline>
                                               <polyline points="7 6 12 11 17 6"></polyline>
                                           </svg>
                                           <span className="text-sm">Iniciar</span>
                                       </button>
                                   ) : (
                                       <>
                                           <button 
                                               onClick={(e) => {
                                                   e.preventDefault();
                                                   e.stopPropagation();
                                                   stopAutoScroll();
                                               }}
                                               className="flex items-center gap-1 p-2 rounded bg-red-500 hover:bg-red-600 text-white" 
                                               title="Detener Auto-scroll (tecla S)">
                                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                   <rect x="6" y="6" width="12" height="12" rx="2"></rect>
                                               </svg>
                                               <span className="text-sm">Detener</span>
                                           </button>
                                           <button onClick={(e) => {
                                               e.preventDefault();
                                               e.stopPropagation();
                                               changeScrollSpeed(-0.1); // Decrementos más pequeños
                                           }} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white" title="Más lento (tecla ↑)">-</button>
                                           <span className="text-sm font-bold">{scrollSpeed.toFixed(2)}x</span>
                                           <button onClick={(e) => {
                                               e.preventDefault();
                                               e.stopPropagation();
                                               changeScrollSpeed(0.1); // Incrementos más pequeños
                                           }} className="p-2 rounded-md bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-800 dark:text-white" title="Más rápido (tecla ↓)">+</button>
                                       </>
                                   )}
                               </div>
                               
                               {/* Modo Libro */}
                               <button 
                                   onClick={() => setBookModeEnabled(!bookModeEnabled)} 
                                   className={`${bookModeEnabled ? 'bg-cyan-600 text-white' : 'bg-gray-200 dark:bg-gray-700'} p-2 rounded-lg flex items-center`}
                                   title="Modo Libro - 2 columnas (tecla B)"
                               >
                                   <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                       <rect x="3" y="3" width="7" height="18"></rect>
                                       <rect x="14" y="3" width="7" height="18"></rect>
                                   </svg>
                               </button>
                               {user.role === 'admin' && <button onClick={handleStartEdit} className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-lg font-bold flex items-center"><Pencil size={18}/></button>}
                               <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="bg-gray-200 dark:bg-gray-700 p-3 rounded-lg"><span className="dark:hidden"><Sun size={18}/></span><span className="hidden dark:inline"><Moon size={18}/></span></button>
                           </div>
                       </div>
                       {/* Contenedor del contenido con auto-scroll - MEJORADO */}
                       <div 
                           ref={mainContentRef} 
                           id="song-content-scroll-container"
                           className={`${fontSizes[fontSizeIndex]} leading-relaxed mb-8 ${bookModeEnabled ? 'book-mode' : 'single-column'} song-content-container`}
                           onClick={() => {
                               // Mostrar dimensiones para depuración
                               const dims = {
                                   height: mainContentRef.current?.clientHeight,
                                   scrollHeight: mainContentRef.current?.scrollHeight,
                                   scrollTop: mainContentRef.current?.scrollTop,
                                   tieneScroll: mainContentRef.current?.scrollHeight > mainContentRef.current?.clientHeight
                               };
                               console.log("DIMENSIONES DEL CONTENEDOR:", dims);
                               
                               // Intentar un scroll manual para probar
                               if (mainContentRef.current) {
                                   mainContentRef.current.scrollBy({top: 10, behavior: 'smooth'});
                                   console.log("Scroll manual ejecutado");
                               }
                           }}
                           style={{
                               // Usamos estilos que se adaptan mejor al contenido
                               minHeight: '70vh',
                               maxHeight: '85vh', 
                               overflowY: 'scroll',
                               // Eliminamos el borde para una apariencia más limpia
                           }}
                       >
                           {/* Contenido de la canción */}
                           {renderAsWebsiteStyle(transposedContent)}
                           
                           {/* Espaciador invisible más pequeño para asegurar que haya algo de contenido scrolleable */}
                           <div style={{ height: '50px', opacity: 0 }}>Espacio extra para scroll</div>
                       </div>

                       {/* Indicador de auto-scroll */}
                       {isAutoScrolling && (
                           <div className="auto-scrolling-indicator">
                               <div className="flex items-center">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce mr-1">
                                      <polyline points="7 13 12 18 17 13"></polyline>
                                  </svg>
                                  Auto-scroll activo - Velocidad: {scrollSpeed.toFixed(2)}x 
                                  <span className="ml-1 text-xs">(Ajusta con ↑/↓)</span>
                               </div>
                               <button 
                                   onClick={(e) => {
                                       e.preventDefault();
                                       e.stopPropagation();
                                       stopAutoScroll();
                                   }} 
                                   className="ml-2 px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded font-bold"
                               >
                                   Detener
                               </button>
                           </div>
                       )}

                       <div className="mb-2 p-2 bg-gray-100 dark:bg-gray-900 rounded-lg text-xs">
                           <h4 className="font-bold mb-1">Atajos de Teclado:</h4>
                           <div className="grid grid-cols-3 gap-1">
                               <div><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">B</kbd> - Modo Libro (2 columnas)</div>
                               <div><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">S</kbd> - Iniciar/Parar Auto-scroll</div>
                               <div><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">+</kbd>/<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">-</kbd> - Cambiar Tono</div>
                               <div><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↑</kbd>/<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↓</kbd> - Cambiar tamaño</div>
                               <div>Con Auto-scroll: <kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↑</kbd>/<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">↓</kbd> - Velocidad</div>
                               <div><kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">1</kbd>/<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">2</kbd>/<kbd className="px-1 py-0.5 bg-gray-200 dark:bg-gray-800 rounded">3</kbd> - Cambiar versión</div>
                           </div>
                       </div>

                       <div className="mb-8"><h3 className="text-xl font-semibold mb-2 flex items-center"><LinkIcon className="mr-2" size={20}/> Notas y Enlaces</h3><textarea value={songNotes} onChange={(e) => setSongNotes(e.target.value)} placeholder="Añade aquí el link de la versión que tocan, arreglos, etc." rows="4" className="w-full p-2 rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"></textarea><button onClick={handleUpdateSongNotes} className="mt-2 bg-blue-500 hover:bg-blue-600 text-white p-2 rounded font-bold flex items-center"><Save className="mr-2" size={18} /> Guardar Notas</button></div>
                       <div className="mb-8"><h3 className="text-xl font-semibold mb-2">Añadir a una lista:</h3><div className="flex flex-wrap gap-2">{privateSetlists.map(setlist => (<button key={setlist.id} onClick={() => handleAddSongToSetlist(setlist.id, 'private')} className="bg-indigo-700 hover:bg-indigo-800 text-white py-1 px-3 rounded-full text-sm">Personal: {setlist.name}</button>))} {user.role === 'admin' && publicSetlists.map(setlist => (<button key={setlist.id} onClick={() => handleAddSongToSetlist(setlist.id, 'public')} className="bg-cyan-700 hover:bg-cyan-800 text-white py-1 px-3 rounded-full text-sm">Banda: {setlist.name}</button>))}</div></div>
                   </div>
               )) : (
                   <div className="flex items-center justify-center h-full"><p className="text-2xl text-gray-400 dark:text-gray-500">Selecciona una canción para comenzar</p></div>
               )}
           </main>
           
           {/* Modal de confirmación para eliminar canción */}
           {showDeleteConfirmation && (
               <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
                   <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
                       <div className="flex items-center text-red-500 mb-4">
                           <AlertTriangle className="mr-2" size={24}/>
                           <h3 className="text-xl font-bold">Confirmar eliminación</h3>
                       </div>
                       
                       <p className="text-gray-700 dark:text-gray-300 mb-6">
                           {pendingDeleteSongId ? (
                               <>
                                   ¿Estás seguro que deseas eliminar la canción <span className="font-bold">{songs.find(s => s.id === pendingDeleteSongId)?.title || ''}</span>?
                                   <br/><br/>
                                   <span className="text-sm opacity-75">La canción será eliminada del listado pero podrá ser recuperada por un administrador.</span>
                               </>
                           ) : 'Error: No se ha seleccionado ninguna canción para eliminar'}
                       </p>
                       
                       <div className="flex justify-end space-x-3">
                           <button 
                               onClick={cancelDeleteSong}
                               className="px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 rounded"
                           >
                               Cancelar
                           </button>
                           <button 
                               onClick={handleDeleteSong}
                               className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded font-medium flex items-center"
                           >
                               <Trash2 size={16} className="mr-2" />
                               Eliminar
                           </button>
                       </div>
                   </div>
               </div>
           )}
       </div>
       </div>
   );
}
