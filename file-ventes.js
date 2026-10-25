// File d'attente des sorties du vendeur (IndexedDB), partagée par la page vendeur.html et le service worker sw.js.
// Elle permet d'envoyer les ventes même quand l'appli est fermée (Background Sync, Chrome Android).
(function (g) {
    const NOM = 'dago-vendeur';
    const ouvrir = () => new Promise((ok, ko) => {
        const r = indexedDB.open(NOM, 1);
        r.onupgradeneeded = () => {
            const d = r.result;
            if (!d.objectStoreNames.contains('file')) d.createObjectStore('file', { keyPath: 'uid' });
            if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
    });
    const req = r => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });
    const fin = t => new Promise((ok, ko) => { t.oncomplete = () => ok(); t.onerror = () => ko(t.error); t.onabort = () => ko(t.error || new Error('annulé')); });
    async function avec(mode, stores, fn) {
        const d = await ouvrir();
        try {
            const t = d.transaction(stores, mode);
            const termine = fin(t);            // écouté AVANT de lancer les requêtes (sinon la fin peut être ratée)
            const res = await fn(t);
            await termine;
            return res;
        } finally { d.close(); }
    }

    const FV = {
        tout: () => avec('readonly', 'file', t => req(t.objectStore('file').getAll())).then(l => l.sort((a, b) => a.ts - b.ts)),
        ajouter: x => avec('readwrite', 'file', t => { t.objectStore('file').put(x); }),
        supprimer: uids => avec('readwrite', 'file', t => { uids.forEach(u => t.objectStore('file').delete(u)); }),
        meta: cle => avec('readonly', 'meta', t => req(t.objectStore('meta').get(cle))),
        definirMeta: (cle, v) => avec('readwrite', 'meta', t => { t.objectStore('meta').put(v, cle); }),

        // garde toutes les sorties non envoyées + les 30 dernières terminées
        async nettoyer() {
            const l = await FV.tout();
            const finies = l.filter(x => x.ok);
            const a_supprimer = finies.slice(0, Math.max(0, finies.length - 30)).map(x => x.uid);
            if (a_supprimer.length) await FV.supprimer(a_supprimer);
        },

        // Envoie toutes les sorties en attente. Retourne { envoyes, refuses, erreur, restant }
        // erreur : null | 'reseau' | 'serveur' | 'pin' | 'config'
        async envoyerTout() {
            const items = (await FV.tout()).filter(x => !x.ok);
            const res = { envoyes: 0, refuses: 0, erreur: null, restant: items.length };
            if (!items.length) return res;
            const cfg = await FV.meta('cfg');
            if (!cfg || !cfg.url || !cfg.pin) { res.erreur = 'config'; return res; }
            for (const x of items) {
                let r;
                try {
                    r = await fetch(cfg.url + '/rest/v1/rpc/ajouter_sortie', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + cfg.anonKey },
                        body: JSON.stringify({ pin: cfg.pin, p_uid: x.uid, p_code: x.code, p_par: x.par, p_motif: x.motif, p_ts: new Date(x.ts).toISOString() })
                    });
                } catch (e) { res.erreur = 'reseau'; break; }
                if (r.ok) { x.ok = true; await FV.ajouter(x); res.envoyes++; continue; }
                const txt = await r.text().catch(() => '');
                if (/PIN/.test(txt)) { res.erreur = 'pin'; break; }
                if (/CODE_INVALIDE/.test(txt)) { x.ok = true; x.refuse = true; await FV.ajouter(x); res.refuses++; continue; } // ne bloque pas les suivants
                res.erreur = 'serveur'; break;
            }
            res.restant = items.length - res.envoyes - res.refuses;
            await FV.nettoyer();
            return res;
        },

        // un seul envoi à la fois, même si la page et le service worker travaillent en même temps
        envoyerFile() {
            const n = g.navigator;
            return (n && n.locks) ? n.locks.request('dago-envoi', () => FV.envoyerTout()) : FV.envoyerTout();
        }
    };
    g.FV = FV;
})(typeof self !== 'undefined' ? self : window);
