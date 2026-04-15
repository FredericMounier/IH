# Divalto — Sorties de Caisse

Projet Google Apps Script pour la gestion des sorties de caisse et export Divalto.

Liée au Google Sheet :
`https://docs.google.com/spreadsheets/d/1hGrdm2-g6jtCWQ_GntoA3-s_7fwFmycw17tM_Vy0n5U`

Hôtels : **LVM** (Le Vieux Megève) · **CAB** (La Caboche) · **FDM** (Ferme du Marie) · **ALP** (Alpaga)

---

## Architecture

```
Code.gs           Backend — routeur, CRUD Sheet, BigQuery, feuille de caisse
formulaire.html   Interface CRUD sorties de caisse (sidebar ou web app standalone)
export.html       Interface export CSV Divalto + feuille de caisse Google Sheet
appsscript.json   Manifest OAuth, timezone, webapp
```

### Schéma du flux

```
formulaire.html
  │
  ├─ Sidebar GAS  →  google.script.run.clientXxx()  →  Code.gs  →  Sheet1
  └─ Standalone   →  fetch() POST                   →  Code.gs  →  Sheet1

export.html
  └─ fetch() GET  →  ?action=csv / ?action=sheet    →  Code.gs  →  BigQuery → CSV / Google Sheet
```

### Google Sheet — Colonnes Sheet1

| Col | Nom | Exemple |
|-----|-----|---------|
| A | Hotel | FDM |
| B | Date | 2026-04-15 |
| C | Account | 58050000 |
| D | AccountLabel | Remise AE |
| E | ComplementaryLabel | test |
| F | AnalyticalAccount | 0 |
| G | AnalyticalLabel | Non affectable |
| H | Amount | 2300.00 |
| I | Type | Sortie de caisse |
| J | CreatedAt | 2026-04-15T18:22:28.324Z |

---

## Points techniques importants

### 1. CORS en sidebar
`fetch() POST` bloqué depuis l'iframe `googleusercontent.com`.
**Fix** : `google.script.run.clientXxx()` → communication interne GAS, zéro CORS.

### 2. Variables GAS dans le HTML
`<?!= JSON.stringify(apiUrl) ?>` dans un `<script>` partagé avec du JS peut casser
le parser si l'URL contient des `<` ou `&`.
**Fix** : deux blocs `<script>` séparés — le premier contient uniquement les vars GAS,
le second est du JS pur sans aucun template.

### 3. Déploiement
Après chaque modification → **Déployer → Gérer → Nouvelle version**.
Sans cela GAS sert l'ancienne version en cache.

---

## Actions disponibles (doGet)

| Action | Description |
|--------|-------------|
| `?action=form` | Formulaire saisie CRUD (web app standalone) |
| `?action=export` | Page export CSV + feuille caisse |
| `?action=history` | Historique JSON (avec row_index) |
| `?action=preview` | Données aperçu JSON |
| `?action=csv` | CSV Divalto (téléchargement) |
| `?action=sheet` | Crée la feuille de caisse Google Sheet |

## Actions disponibles (doPost)

| Body JSON | Description |
|-----------|-------------|
| `{action:'insert', ...}` | Nouvelle ligne |
| `{action:'update', row_index:N, ...}` | Modifie ligne N |
| `{action:'delete', row_index:N}` | Supprime ligne N |

---

## Déploiement étape par étape

1. Ouvrir [script.google.com](https://script.google.com) → projet lié au sheet `Saisiesortiescaisse`
2. Remplacer les 4 fichiers dans l'éditeur
3. `appsscript.json` → menu **Projet** → **Paramètres** → activer "Afficher le fichier manifeste"
4. **Déployer** → **Gérer les déploiements** → ✏️ → **Nouvelle version** → Enregistrer
5. Ouvrir le sheet → menu **📋 Caisse** apparaît automatiquement
6. Tester en standalone : `URL_DEPLOY?action=form&hotel=FDM&date=2026-04-15`

---

## Plan de comptes

| Compte | Libellé |
|--------|---------|
| 58010000 | Remise ESP |
| 58020000 | Remise CH |
| 58030000 | Remise CB |
| 58040000 | Virement bancaire |
| 58050000 | Remise AE |
| 58060000 | Diners |
| 44566000 | Tva/achats |
| 60613000 | Carburant |
| 60630000 | Petit matériel |
| 60630100 | Petit mat salle |
| 60631000 | Pdt entretien |
| 60640000 | Fourniture adm |
| 60710000 | Achat solide |
| 60730000 | Achat liquide |
| 61110000 | Blanchisserie |
| 61400000 | Charges locatives |
| 62220000 | Com.agence Indiv. |
| 62220100 | Com.agence séminaire |
| 62340000 | Cadeau client |
| 62385000 | Décoration |
| 62386000 | Presse |
| 62387000 | Fleurs |
| 62388000 | Pdt accueil |
| 62391000 | Prestation HH enf. |
| 62392000 | Animation musicale |
| 62410000 | Transport |
| 62510000 | Voyage/déplacement |
| 62570000 | Frais de réception |
| 62610000 | Affranchissement |
| 63780000 | Droit de quai |
| 64750000 | Pharmacie |
| 64810000 | Uniformes |
| 65810000 | Charge gestion courante |
| 67180000 | Autre charge ex. |
| 42100000 | Salaire |
| 42500000 | Perso. Acompte |
| 46700100 | Débours fleurs |
| 46700200 | Débours taxi |
| 46700800 | Débours Pharmacie |
| 46700900 | Débours presse |
| 46701000 | Débours divers |
| 46701200 | Débours forfait ski |
| 46702000 | Débours |
| 47100000 | Compte attente |
| 75810000 | Pdt gestion courante |
| 77180000 | Produit exceptionnel |

## Sections analytiques

| Code | Libellé |
|------|---------|
| 0 | Non affectable |
| 1 | Salle |
| 2 | Cuisine |
| 3 | Réception |
| 4 | Étage |
| 5 | Conciergerie |
| 6 | Spa |
| 7 | Maintenance |
| 8 | Direction |
| 9 | Synthèse |

---

*Généré le 2026-04-15 — Fred / Dreamearly*
