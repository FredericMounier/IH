// ================================================================
// Apps Script — Saisie CRUD + Export Divalto + Feuille de caisse
//
// Actions GET :
//   ?action=form     → formulaire saisie CRUD (web app standalone)
//   ?action=export   → page export (CSV + feuille caisse)
//   ?action=history  → historique JSON (avec row_index)
//   ?action=preview  → données aperçu JSON
//   ?action=csv      → CSV Divalto (téléchargement)
//   ?action=sheet    → crée la feuille de caisse Google Sheet
//
// Actions POST (body JSON) :
//   {action:'insert', ...}  → nouvelle ligne
//   {action:'update', row_index:N, ...} → modifie ligne N
//   {action:'delete', row_index:N}      → supprime ligne N
//
// Intégration Google Sheets :
//   onOpen()          → menu 📋 Caisse dans la barre du Sheet
//   showFormSidebar() → ouvre formulaire.html en sidebar
//   showExportDialog()→ ouvre export.html en modale
// ================================================================

var SHEET_ID   = '1hGrdm2-g6jtCWQ_GntoA3-s_7fwFmycw17tM_Vy0n5U';
var SHEET_NAME = 'Sheet1';
var PROJECT_ID = 'bitool0';
var DATASET    = 'mhs2024';

var ANALYTICAL_LABELS = {
  '0':'Non affectable','1':'salle','2':'cuisine','3':'reception',
  '4':'étage','5':'conciergerie','6':'spa','7':'maintenance',
  '8':'direction','9':'synthese'
};

var DIVALTO_HEADERS = [
  "Date d'écriture","Date de pièce","JR","N° Compte","N° pièce",
  "N° ligne","Libellé","Montant","Sens","Mode de règlement",
  "Date d'échéance","Compte de contrepartie","Code lettrage",
  "Date de lettrage","Code pointage","Date de pointage",
  "Section analytique","Montant en devise","Devise de l'écriture",
  "Montant analytique en devise","ERREUR","Contrôle DEBIT","Contrôle CREDIT"
];

var DIVALTO_BQ_COLS = [
  'Date_ecriture','Date_piece','JR','No_Compte','No_piece',
  'No_ligne','Libelle','Montant','Sens','Mode_reglement',
  'Date_echeance','Compte_contrepartie','Code_lettrage',
  'Date_lettrage','Code_pointage','Date_pointage',
  'Section_analytique','Montant_devise','Devise',
  'Montant_analytique_devise','ERREUR','Controle_DEBIT','Controle_CREDIT'
];

// ================================================================
// INTÉGRATION GOOGLE SHEETS — Menu + Sidebar + Modale
// ================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📋 Caisse')
    .addItem('✏️  Saisie des écritures', 'showFormSidebar')
    .addSeparator()
    .addItem('📥  Export Divalto / Feuille de caisse', 'showExportDialog')
    .toUi();
}

function showFormSidebar() {
  var tpl = HtmlService.createTemplateFromFile('formulaire');
  tpl.apiUrl       = ScriptApp.getService().getUrl();
  tpl.defaultHotel = '';
  tpl.defaultDate  = Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
  var html = tpl.evaluate()
    .setTitle('Saisie des écritures de caisse')
    .setWidth(900);
  SpreadsheetApp.getUi().showSidebar(html);
}

function showExportDialog() {
  var tpl = HtmlService.createTemplateFromFile('export');
  tpl.apiUrl           = ScriptApp.getService().getUrl();
  tpl.defaultHotel     = '';
  tpl.defaultDateDebut = '';
  tpl.defaultDateFin   = '';
  tpl.defaultBatch     = '';
  tpl.defaultReport    = '0';
  var html = tpl.evaluate()
    .setTitle('Export Divalto + Feuille de caisse')
    .setWidth(560);
  SpreadsheetApp.getUi().showModalDialog(html, 'Export Divalto + Feuille de caisse');
}

// ================================================================
// ROUTEUR doGet
// ================================================================
function doGet(e) {
  var action    = e.parameter.action     || 'form';
  var hotel     = (e.parameter.hotel     || '').toUpperCase();
  var date      =  e.parameter.date      || '';
  var dateDebut =  e.parameter.date_debut || '';
  var dateFin   =  e.parameter.date_fin   || '';
  var batch     =  e.parameter.batch      || '';
  var report    =  e.parameter.report     || '0';
  var apiUrl    =  ScriptApp.getService().getUrl();

  if (action === 'form') {
    var tpl = HtmlService.createTemplateFromFile('formulaire');
    tpl.defaultHotel = hotel;
    tpl.defaultDate  = date || Utilities.formatDate(new Date(), 'Europe/Paris', 'yyyy-MM-dd');
    tpl.apiUrl       = apiUrl;
    return tpl.evaluate()
      .setTitle('Saisie des écritures de caisse')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'export') {
    var tpl = HtmlService.createTemplateFromFile('export');
    tpl.defaultHotel     = hotel;
    tpl.defaultDateDebut = dateDebut;
    tpl.defaultDateFin   = dateFin;
    tpl.defaultBatch     = batch;
    tpl.defaultReport    = report;
    tpl.apiUrl           = apiUrl;
    return tpl.evaluate()
      .setTitle('Export Divalto + Feuille de caisse')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (action === 'history') {
    return jsonOut(getHistory(hotel, date));
  }

  if (action === 'range') {
    return jsonOut(clientGetRangeData(hotel, date, e.parameter.date_to || ''));
  }

  if (action === 'allData') {
    return jsonOut({ rows: clientGetAllSheetData() });
  }

  if (action === 'preview') {
    try {
      callBqProc(dateDebut, dateFin, batch || null, 'PREVIEW');
      var rows = readBqTable(
        'SELECT source, hotel_date, libelle, no_compte, montant, '
        + 'total_jour, cumul_jour, ecart_restant, caisse '
        + 'FROM `' + PROJECT_ID + '.' + DATASET + '.LVM_DIVALTO_preview` '
        + 'ORDER BY hotel_date, source, piece_num'
      );
      return jsonOut({ rows: rows });
    } catch(err) { return jsonOut({ error: err.message }); }
  }

  if (action === 'csv') {
    try {
      callBqProc(dateDebut, dateFin, batch || null, 'DIVALTO');
      var rows = readBqTable(buildDivaltoSelectQuery());
      var csv  = buildCsv(rows);
      var filename = buildFilename(hotel, dateDebut, batch, 'csv');
      return ContentService.createTextOutput(csv)
        .setMimeType(ContentService.MimeType.CSV)
        .downloadAsFile(filename);
    } catch(err) { return jsonOut({ error: err.message }); }
  }

  if (action === 'sheet') {
    try {
      callBqProc(dateDebut, dateFin, batch || null, 'PREVIEW');
      var previewRows = readBqTable(
        'SELECT * FROM `' + PROJECT_ID + '.' + DATASET + '.LVM_DIVALTO_preview` '
        + 'ORDER BY hotel_date, source, piece_num'
      );
      var sheetUrl = createCaisseSheet(hotel, dateDebut, dateFin, parseFloat(report), previewRows);
      return jsonOut({ success: true, url: sheetUrl });
    } catch(err) { return jsonOut({ error: err.message }); }
  }

  return jsonOut({ error: 'Action inconnue : ' + action });
}

// ================================================================
// POST — Insert / Update / Delete
// ================================================================
function doPost(e) {
  try {
    var b = JSON.parse(e.postData.contents);
    var action = b.action || 'insert';

    // ── DELETE ────────────────────────────────────────────────────
    if (action === 'delete') {
      if (!b.row_index) return jsonOut({ error: 'row_index manquant' });
      deleteRow(parseInt(b.row_index));
      return jsonOut({ success: true });
    }

    // ── BATCH SAVE ────────────────────────────────────────────────
    if (action === 'batchSave') {
      return jsonOut(clientBatchSave(b.items || []));
    }

    // ── UPDATE ────────────────────────────────────────────────────
    if (action === 'update') {
      if (!b.row_index) return jsonOut({ error: 'row_index manquant' });
      if (!b.hotel || !b.date || !b.account || b.amount === undefined)
        return jsonOut({ error: 'Champs obligatoires manquants' });
      if (isNaN(parseFloat(b.amount)))
        return jsonOut({ error: 'Montant invalide' });
      updateRow(b);
      return jsonOut({ success: true });
    }

    // ── INSERT (défaut) ───────────────────────────────────────────
    if (!b.hotel || !b.date || !b.account || b.amount === undefined)
      return jsonOut({ error: 'Champs obligatoires manquants' });
    if (isNaN(parseFloat(b.amount)))
      return jsonOut({ error: 'Montant invalide' });
    appendRow(b);
    return jsonOut({ success: true });

  } catch(err) {
    Logger.log(err);
    return jsonOut({ error: err.message });
  }
}

// ================================================================
// FEUILLE DE CAISSE — Crée un Google Sheet formaté (impression/PDF)
// ================================================================
function createCaisseSheet(hotel, dateDebut, dateFin, reportMontant, previewRows) {

  var HOTEL_NAMES = {
    'LVM': 'LE VIEUX MEGÈVE', 'CAB': 'LA CABOCHE',
    'FDM': 'FERME DU MARIE',  'ALP': 'ALPAGA'
  };
  var hotelLabel = HOTEL_NAMES[hotel] || hotel;

  var byDate = {};
  previewRows.forEach(function(r) {
    var d = r.hotel_date || '';
    if (!byDate[d]) byDate[d] = { pms: [], saisie: [], totalJour: 0 };
    if (r.source === 'PMS/TPE') {
      byDate[d].pms.push(r);
      if (parseFloat(r.total_jour || 0) > byDate[d].totalJour)
        byDate[d].totalJour = parseFloat(r.total_jour || 0);
    } else {
      byDate[d].saisie.push(r);
    }
  });

  var dates = Object.keys(byDate).sort();

  var ss;
  var existingId = PropertiesService.getScriptProperties().getProperty('CAISSE_SHEET_ID');
  try { ss = existingId ? SpreadsheetApp.openById(existingId) : null; }
  catch(e) { ss = null; }

  if (!ss) {
    ss = SpreadsheetApp.create('Feuilles de caisse — ' + hotel);
    PropertiesService.getScriptProperties().setProperty('CAISSE_SHEET_ID', ss.getId());
  }

  var tabName = hotel + ' ' + dateDebut
    + (dateFin !== dateDebut ? ' → ' + dateFin : '');
  try { ss.deleteSheet(ss.getSheetByName(tabName)); } catch(e) {}
  var sheet = ss.insertSheet(tabName);

  var row    = 1;
  var orange = '#F5A623';
  var yellow = '#FFD966';
  var cyan   = '#B7E1CD';
  var white  = '#FFFFFF';

  dates.forEach(function(dateKey) {
    var dayData         = byDate[dateKey];
    var totalRecettes   = dayData.totalJour;
    var totalDepenses   = dayData.pms.reduce(function(s, r) {
      return s + Math.abs(parseFloat(r.montant || 0));
    }, 0) + dayData.saisie.reduce(function(s, r) {
      return s + Math.abs(parseFloat(r.montant || 0));
    }, 0);
    var totalAvecReport = totalRecettes + reportMontant;
    var solde           = totalAvecReport - totalDepenses;

    setCell(sheet, row, 3, hotelLabel, true, 12);
    setCell(sheet, row, 4, 'NOTES', false, 10);
    colorRow(sheet, row, 3, 5, cyan);
    row++;

    setCell(sheet, row, 1, formatDateFr(dateKey), true, 14);
    row++;

    var headers = ['RECETTES','','n°compte','libellé','libellé complt.','IA','DÉPENSES'];
    headers.forEach(function(h, i) { setCell(sheet, row, i + 1, h, true, 9); });
    colorRow(sheet, row, 1, 7, orange);
    row++;

    sheet.getRange(row, 1).setValue(totalRecettes)
      .setNumberFormat('#,##0.00').setBackground(yellow).setFontWeight('bold');
    colorRow(sheet, row, 2, 7, orange);
    row++;

    dayData.pms.forEach(function(r) {
      sheet.getRange(row, 1).setBackground(orange);
      sheet.getRange(row, 2).setBackground(orange);
      setCell(sheet, row, 3, r.no_compte, false, 9);
      setCell(sheet, row, 4, r.libelle,   false, 9);
      sheet.getRange(row, 7).setValue(Math.abs(parseFloat(r.montant || 0)))
        .setNumberFormat('#,##0.00');
      colorRow(sheet, row, 3, 7, orange);
      row++;
    });

    dayData.saisie.forEach(function(r) {
      sheet.getRange(row, 1).setBackground(orange);
      sheet.getRange(row, 2).setBackground(orange);
      setCell(sheet, row, 3, r.no_compte,          false, 9);
      setCell(sheet, row, 4, r.libelle,             false, 9);
      setCell(sheet, row, 5, r.complementary || '', false, 9);
      setCell(sheet, row, 6, r.analytical   || '',  false, 9);
      sheet.getRange(row, 7).setValue(Math.abs(parseFloat(r.montant || 0)))
        .setNumberFormat('#,##0.00');
      colorRow(sheet, row, 3, 7, orange);
      row++;
    });

    for (var i = 0; i < 8; i++) { colorRow(sheet, row, 1, 7, orange); row++; }

    var footerRows = [
      [totalRecettes,   'Total des recettes',                         '', '', ''],
      [reportMontant,   'Report du jour précédent',                   '', '', ''],
      [totalAvecReport, 'Total',                                      '', '', ''],
      [totalRecettes,   'A déduire',                 'Total des dépenses', '', totalDepenses],
      [solde,           'Solde en caisse à reporter au jour suivant', '', '', ''],
    ];
    footerRows.forEach(function(fr, fi) {
      var bg = (fi === 4) ? cyan : (fi % 2 === 0 ? '#E8E8E8' : white);
      sheet.getRange(row, 1).setValue(fr[0]).setNumberFormat('#,##0.00')
        .setBackground(bg).setFontWeight('bold');
      setCell(sheet, row, 2, fr[1], fi === 4, 9);
      if (fr[2]) setCell(sheet, row, 5, fr[2], false, 9);
      if (fr[4]) sheet.getRange(row, 7).setValue(fr[4]).setNumberFormat('#,##0.00');
      sheet.getRange(row, 1, 1, 7).setBackground(bg);
      row++;
    });

    reportMontant = solde;
    row += 2;
  });

  sheet.setColumnWidth(1, 90);  sheet.setColumnWidth(2, 20);
  sheet.setColumnWidth(3, 90);  sheet.setColumnWidth(4, 130);
  sheet.setColumnWidth(5, 110); sheet.setColumnWidth(6, 30);
  sheet.setColumnWidth(7, 90);

  return ss.getUrl() + '#gid=' + sheet.getSheetId();
}

// ── Helpers Sheet ─────────────────────────────────────────────────
function setCell(sheet, row, col, value, bold, size) {
  var cell = sheet.getRange(row, col);
  cell.setValue(value).setFontSize(size || 9);
  if (bold) cell.setFontWeight('bold');
}
function colorRow(sheet, row, fromCol, toCol, color) {
  sheet.getRange(row, fromCol, 1, toCol - fromCol + 1).setBackground(color);
}
function formatDateFr(dateStr) {
  if (!dateStr) return '';
  var parts = dateStr.split('-');
  if (parts.length === 3) return parts[2] + parts[1] + parts[0];
  return dateStr;
}

// ── BigQuery helpers ──────────────────────────────────────────────
function callBqProc(dateDebut, dateFin, batch, mode) {
  var batchParam = batch ? "'" + batch + "'" : 'NULL';
  var query = "CALL `" + PROJECT_ID + "." + DATASET + ".LVM_DIVALTO_export`("
            + "DATE('" + dateDebut + "'), DATE('" + dateFin + "'), "
            + batchParam + ", '" + mode + "')";
  var res = UrlFetchApp.fetch(
    'https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/jobs',
    {
      method: 'post',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type': 'application/json' },
      payload: JSON.stringify({ configuration: { query: { query: query, useLegacySql: false, location: 'EU' } } }),
      muteHttpExceptions: true
    }
  );
  var job = JSON.parse(res.getContentText());
  if (job.status && job.status.errorResult) throw new Error(job.status.errorResult.message);
  waitForJob(job.jobReference.jobId);
}

function waitForJob(jobId) {
  for (var i = 0; i < 120; i += 3) {
    Utilities.sleep(3000);
    var res = UrlFetchApp.fetch(
      'https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/jobs/' + jobId,
      { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
    );
    var status = JSON.parse(res.getContentText()).status;
    if (status.errorResult) throw new Error(status.errorResult.message);
    if (status.state === 'DONE') return;
  }
  throw new Error('Timeout BQ job (6 min dépassées)');
}

function readBqTable(query) {
  var res = UrlFetchApp.fetch(
    'https://bigquery.googleapis.com/bigquery/v2/projects/' + PROJECT_ID + '/queries',
    {
      method: 'post',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Type': 'application/json' },
      payload: JSON.stringify({ query: query, useLegacySql: false, location: 'EU', timeoutMs: 30000, maxResults: 50000 }),
      muteHttpExceptions: true
    }
  );
  var data = JSON.parse(res.getContentText());
  if (data.error) throw new Error(data.error.message);
  if (!data.rows) return [];
  var fields = data.schema.fields.map(function(f) { return f.name; });
  return data.rows.map(function(r) {
    var obj = {};
    r.f.forEach(function(cell, i) { obj[fields[i]] = cell.v; });
    return obj;
  });
}

function buildDivaltoSelectQuery() {
  return 'SELECT ' + DIVALTO_BQ_COLS.join(', ')
       + ' FROM `' + PROJECT_ID + '.' + DATASET + '.LVM_DIVALTO_export`'
       + ' ORDER BY _hotel_date, _partie, _sort_bloc, _sort_row';
}

function buildCsv(rows) {
  var esc = function(v) {
    if (v === null || v === undefined) return '';
    var s = String(v);
    return (s.indexOf(';') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0)
      ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var lines = [DIVALTO_HEADERS.map(esc).join(';')];
  rows.forEach(function(r) {
    lines.push(DIVALTO_BQ_COLS.map(function(c) { return esc(r[c]); }).join(';'));
  });
  return '\uFEFF' + lines.join('\r\n');
}

function buildFilename(hotel, dateDebut, batch, ext) {
  var month = dateDebut.slice(0, 7).replace('-', '');
  var bl    = batch ? '_' + batch : '';
  return 'Import_Divalto_' + hotel + bl + '_' + month + '.' + ext;
}

// ── CRUD Sheet ────────────────────────────────────────────────────

function appendRow(b) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  sheet.appendRow([
    b.hotel.toUpperCase(), b.date, b.account,
    b.account_label        || '',
    b.complementary_label  || '',
    b.analytical           || '0',
    ANALYTICAL_LABELS[String(b.analytical || '0')] || 'Non affectable',
    parseFloat(b.amount),
    b.sens === 'recette' ? 'Entrée de caisse' : 'Sortie de caisse',
    new Date().toISOString()
  ]);
}

function updateRow(b) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var ri    = parseInt(b.row_index);
  sheet.getRange(ri, 1, 1, 10).setValues([[
    b.hotel.toUpperCase(), b.date, b.account,
    b.account_label        || '',
    b.complementary_label  || '',
    b.analytical           || '0',
    ANALYTICAL_LABELS[String(b.analytical || '0')] || 'Non affectable',
    parseFloat(b.amount),
    b.sens === 'recette' ? 'Entrée de caisse' : 'Sortie de caisse',
    new Date().toISOString()
  ]]);
}

function deleteRow(rowIndex) {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  sheet.deleteRow(parseInt(rowIndex));
}

function getHistory(hotel, date) {
  if (!hotel || !date) return { rows: [] };
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  var rows  = [];
  // data[0] = en-têtes (ligne 1 du sheet), data[i] = ligne i+1
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[0]).toUpperCase() !== hotel) continue;
    if (formatDateVal(r[1]) !== date) continue;
    rows.push({
      row_index:           i + 1,           // numéro de ligne réel dans le Sheet (1-based)
      account:             String(r[2]),
      account_label:       String(r[3]),
      complementary_label: String(r[4]),
      analytical:          String(r[5]),
      analytical_label:    String(r[6]),
      amount:              parseFloat(r[7]) || 0,
      sens:                String(r[8]) === 'Entrée de caisse' ? 'recette' : 'depense',
      type:                String(r[8]),
      heure:               formatHeureVal(r[9])
    });
  }
  return { rows: rows };
}

function formatDateVal(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Paris', 'yyyy-MM-dd');
  return String(val).slice(0, 10);
}

function formatHeureVal(val) {
  if (!val) return '';
  if (val instanceof Date) return Utilities.formatDate(val, 'Europe/Paris', 'HH:mm');
  var m = String(val).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
}


// ================================================================
// FONCTIONS APPELABLES VIA google.script.run (sidebar/modale)
// Bypass CORS — communication interne GAS uniquement
// ================================================================

function clientGetHistory(hotel, date) {
  return getHistory(hotel, date);
}

function clientGetRangeData(hotel, dateStart, dateEnd) {
  if (!hotel || !dateStart || !dateEnd) return { rows: [] };
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  var rows  = [];
  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    if (String(r[0]).toUpperCase() !== hotel) continue;
    var d = formatDateVal(r[1]);
    if (d < dateStart || d > dateEnd) continue;
    rows.push({
      row_index:           i + 1,
      date:                d,
      account:             String(r[2]),
      account_label:       String(r[3]),
      complementary_label: String(r[4]),
      analytical:          String(r[5]),
      amount:              parseFloat(r[7]) || 0,
      sens:                String(r[8]) === 'Entrée de caisse' ? 'recette' : 'depense',
      heure:               formatHeureVal(r[9])
    });
  }
  return { rows: rows };
}

function clientInsertRow(data) {
  if (!data.hotel || !data.date || !data.account || data.amount === undefined)
    throw new Error('Champs obligatoires manquants');
  if (isNaN(parseFloat(data.amount)))
    throw new Error('Montant invalide');
  appendRow(data);
  return { success: true };
}

function clientUpdateRow(data) {
  if (!data.row_index) throw new Error('row_index manquant');
  if (!data.hotel || !data.date || !data.account || data.amount === undefined)
    throw new Error('Champs obligatoires manquants');
  if (isNaN(parseFloat(data.amount)))
    throw new Error('Montant invalide');
  updateRow(data);
  return { success: true };
}

function clientDeleteRow(rowIndex) {
  if (!rowIndex) throw new Error('rowIndex manquant');
  deleteRow(parseInt(rowIndex));
  return { success: true };
}

function clientBatchSave(items) {
  var errors = [];
  items.forEach(function(item) {
    try {
      if (item.action === 'delete') {
        deleteRow(parseInt(item.row_index));
      } else if (item.action === 'update') {
        updateRow(item);
      } else {
        appendRow(item);
      }
    } catch(e) { errors.push(e.message); }
  });
  return { success: !errors.length, errors: errors };
}

function clientGetAllSheetData() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  var data  = sheet.getDataRange().getValues();
  var result = [];

  for (var i = 1; i < data.length; i++) {
    var r = data[i];
    result.push({
      hotel:               String(r[0] || ''),
      date:                formatDateVal(r[1] || ''),
      account:             String(r[2] || ''),
      account_label:       String(r[3] || ''),
      complementary_label: String(r[4] || ''),
      analytical:          String(r[5] || ''),
      analytical_label:    String(r[6] || ''),
      amount:              parseFloat(r[7]) || 0,
      type:                String(r[8] || ''),
      created:             String(r[9] || '')
    });
  }
  return result;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
