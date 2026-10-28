/**
 * Golden Dago : réception des sorties envoyées par l'appli Stock.
 * Colle ce code dans Extensions > Apps Script de ton Google Sheet, change MOT_DE_PASSE,
 * puis Déployer > Nouveau déploiement > Application Web (Exécuter en tant que : Moi ; Accès : Tout le monde).
 * Les lignes arrivent dans l'onglet « Sorties App » (rien d'autre n'est modifié dans ton Sheet).
 */
const MOT_DE_PASSE = 'CHANGE-MOI';      // invente un mot de passe, et mets le même dans l'appli (Outils > Google Sheets)
const FEUILLE = 'Sorties App';

function reponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
// un texte qui commencerait par = + - @ serait pris pour une formule : on le neutralise
function texte_(v) {
  const s = String(v == null ? '' : v).slice(0, 80);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doGet() { return reponse_({ ok: true, message: 'Script Golden Dago actif' }); }

function doPost(e) {
  const verrou = LockService.getScriptLock();
  verrou.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (MOT_DE_PASSE === 'CHANGE-MOI' || d.token !== MOT_DE_PASSE) return reponse_({ ok: false, erreur: 'mot de passe incorrect' });
    const classeur = SpreadsheetApp.getActiveSpreadsheet();
    const f = classeur.getSheetByName(FEUILLE);
    if (!f) return reponse_({ ok: false, erreur: "onglet « " + FEUILLE + " » introuvable" });
    if (d.test) return reponse_({ ok: true, feuille: classeur.getName() });

    // identifiants déjà présents (colonne A) : évite tout doublon si l'appli renvoie une ligne
    const hauteur = Math.max(f.getMaxRows() - 1, 1);
    const colA = f.getRange(2, 1, hauteur, 1).getValues().map(function (r) { return String(r[0]); });
    const ligneDe = {}; let derniere = -1;
    colA.forEach(function (id, i) { if (id !== '') { ligneDe[id] = i + 2; derniere = i; } });

    const lignes = (d.lignes || []).slice(0, 500).filter(function (l) { return l && l.id && !ligneDe[String(l.id)]; });
    let ajoutes = 0;
    if (lignes.length) {
      const debut = derniere + 3; // première ligne libre
      const valeurs = lignes.map(function (l) {
        const t = new Date(Number(l.ts) || Date.now());
        return [texte_(l.id), t, t, texte_(l.produit), Number(l.qte) || 1, l.tarif === 'Revendeur' ? 'Revendeur' : 'Standard', texte_(l.type || 'Vente'), texte_(l.par), texte_(l.code)];
      });
      f.getRange(debut, 1, valeurs.length, 9).setValues(valeurs);
      f.getRange(debut, 2, valeurs.length, 1).setNumberFormat('yyyy-mm-dd');
      f.getRange(debut, 3, valeurs.length, 1).setNumberFormat('HH:mm:ss');
      lignes.forEach(function (l, i) { ligneDe[String(l.id)] = debut + i; });
      ajoutes = valeurs.length;
    }
    // annulations et crédits payés
    let maj = 0;
    (d.maj || []).slice(0, 500).forEach(function (m) {
      const r = m && ligneDe[String(m.id)];
      if (!r) return;
      if (m.annule) {
        const type = String(f.getRange(r, 7).getValue());
        if (type.indexOf('ANNULÉ') !== 0) { f.getRange(r, 5).setValue(0); f.getRange(r, 7).setValue('ANNULÉ (' + type + ')'); maj++; }
      } else if (m.paye) {
        f.getRange(r, 13).setValue(new Date(Number(m.paye))).setNumberFormat('yyyy-mm-dd'); maj++;
      }
    });
    return reponse_({ ok: true, ajoutes: ajoutes, maj: maj });
  } catch (err) {
    return reponse_({ ok: false, erreur: String(err) });
  } finally {
    verrou.releaseLock();
  }
}
