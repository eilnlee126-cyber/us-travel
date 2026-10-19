import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getFirestore, collection, doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Reuse the travel site's existing Firebase project and shared-record model.
const firebaseConfig = {
    apiKey: 'AIzaSyDsa9pz-O_s4KUXvJ5duuRIWCQx_umspuc',
    authDomain: 'ustravel-513fb.firebaseapp.com',
    projectId: 'ustravel-513fb',
    storageBucket: 'ustravel-513fb.firebasestorage.app',
    messagingSenderId: '57988064191',
    appId: '1:57988064191:web:5f08645b91ed9d21c3370a'
};

export function createExpenseSync(receive, fail) {
    const name = 'travelExpenses2026';
    const app = getApps().find(item => item.name === name) || initializeApp(firebaseConfig, name);
    const db = getFirestore(app);
    const records = collection(db, 'tripExpenses2026');
    const stop = onSnapshot(records, { includeMetadataChanges: true }, snapshot => {
        const entries = [];
        snapshot.forEach(item => {
            const entry = item.data();
            if (entry.id === item.id) entries.push(entry);
        });
        receive(entries, snapshot.metadata.fromCache);
    }, fail);
    return { stop, write: entry => setDoc(doc(records, entry.id), entry) };
}
