import { objectUrl, jaarBereik, jaarTekst, JAAR_MIN, JAAR_MAX, buildQuery, buildExportQuery, buildRelationQuery, inhoudVan, erfgoedQuery, erfgoedDemoUrl, ERFGOED_ENDPOINT, lookupQuery, insideClause, nearClause, AFSTANDEN, MET_INHOUD, MET_LOCATIE, PARENT_FIELDS, VERBORGEN, verbergt, vertrouwelijk, bucketsOf, search, setService, DEFAULT_SERVICE, facets, fields, sorts, soorten, extern, soortVan, values, textValue, safeUrl, toParams, fromParams, describe, toCsv, DEFAULT_FIELD, PAGE_SIZE, MAX_WINDOW, EXPORT_MAX } from './search.js';
import { geometryFor } from './geo.js';
const $ = id => document.getElementById(id);
// Testschakelaar: ?service=<naam> zoekt in een andere service van rce/archeologie-sdo.
const service = setService(new URLSearchParams(location.search).get('service'));
const blank = () => ({ query: '', field: DEFAULT_FIELD, filters: {}, page: 0, sort: 'relevantie', binnen: null, jaar: null, locatie: false, jokers: state?.jokers ?? false });
let state; state = blank();
let controller, needsFit = false, lastTotal = 0;
const cards = new Map(), markers = new Map(), shapes = new Map(), relationSlots = new Map();
const wide = window.matchMedia('(min-width: 1100px)');
const colors = { archeologischonderzoeksgebied: '#39870c', vondstlocatie: '#01689b', archeologischterrein: '#673327', archeologischcomplex: '#a90061', grondsporen: '#b85500', vondsten: '#42145f' };
// Leaflet komt van een CDN; zonder Leaflet werkt de demo verder zonder kaart.
const map = window.L ? L.map('map', { zoomControl: true }).setView([52.2, 5.3], 7) : null;
const contextLayer = map ? L.featureGroup().addTo(map) : null;
const markerLayer = map ? L.featureGroup().addTo(map) : null;
if (map) L.tileLayer('https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png', { minZoom: 6, maxZoom: 19, attribution: 'Kaart: <a href="https://www.pdok.nl/" target="_blank" rel="noopener">PDOK</a> / Kadaster' }).addTo(map);
else $('map').append(el('p', 'De kaartbibliotheek kon niet worden geladen.', 'empty'));
const format = number => new Intl.NumberFormat('nl-NL').format(number);
// Sommige bronwaarden zijn dubbel gecodeerd. Entiteiten worden als tekst gedecodeerd; er komt nooit HTML uit de bron in de pagina.
const decode = text => (/&[#\w]+;/.test(text) ? new DOMParser().parseFromString(text, 'text/html').body.textContent : text);
// Waarden die alleen in spaties of hoofdletters verschillen (komt in de bron voor, bijv. "proefputten /proefsleuven"
// naast "proefputten/proefsleuven") worden één keer getoond.
const uniek = list => { const gezien = new Set(); return list.filter(item => { const sleutel = item.replace(/\s*\/\s*/g, '/').replace(/\s+/g, ' ').trim().toLowerCase(); return !gezien.has(sleutel) && gezien.add(sleutel); }); };
const show = value => decode(uniek(values(value)).join(', '));
const soortLabel = soort => soorten[soort] ?? extern[soort] ?? 'Object';
const meervoud = { archeologischonderzoeksgebied: ['onderzoeksgebied', 'onderzoeksgebieden'], vondstlocatie: ['vondstlocatie', 'vondstlocaties'], archeologischterrein: ['archeologisch terrein', 'archeologische terreinen'], archeologischcomplex: ['archeologisch complex', 'archeologische complexen'], grondsporen: ['grondspoor', 'grondsporen'], vondsten: ['vondst', 'vondsten'] };
const aantalSoort = (soort, count) => `${format(count)} ${(meervoud[soort] ?? [soort, soort])[count === 1 ? 0 : 1]}`;
function el(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function button(text, callback, className) { const node = el('button', text, className); node.type = 'button'; node.addEventListener('click', callback); return node; }
async function kopieer(tekst, knop) {
  const oud = knop.textContent;
  try { await navigator.clipboard.writeText(tekst); knop.textContent = 'Gekopieerd'; }
  catch { window.prompt('Kopieer deze link:', tekst); }
  setTimeout(() => { knop.textContent = oud; }, 2000);
}
function link(text, url) { const node = el('a', text); node.href = url; node.target = '_blank'; node.rel = 'noopener noreferrer'; return node; }

// Context "binnen": wat in een onderzoeksgebied, vondstlocatie of terrein ligt, of alles in de buurt van een object.
const contexts = new Map();
async function resolveContext(binnen) {
  if (!binnen) return null;
  if (contexts.has(binnen)) return contexts.get(binnen);
  const bits = binnen.split(':');
  const [soort, nummer] = bits[0] === 'rond' ? bits.slice(1, 3) : bits;
  const hit = (await search(lookupQuery(soort, nummer), AbortSignal.timeout(20000))).hits.hits[0];
  if (!hit) throw new Error(`${soortLabel(soort)} ${nummer} bestaat niet in deze index.`);
  const source = hit._source, uri = source['@id'], naam = show(source[fields.name]), geometry = geometryFor(source);
  let context;
  if (bits[0] === 'rond') {
    // Alles met een geometrie dat (deels) binnen een cirkel rond het (zwaarte)punt van het object valt.
    if (!geometry) throw new Error(`${soortLabel(soort)} ${nummer} heeft geen locatie.`);
    const meters = Number(bits[3]);
    context = { soort, nummer, uri, meters, clause: nearClause(geometry.point, meters, uri), label: `${format(meters)} m rond ${soortLabel(soort).toLowerCase()} ${nummer}${naam ? ` “${naam}”` : ''}`, summary: 'alles met een locatie dat (deels) binnen deze afstand van het punt van het object ligt (geo_distance)', geometry, circle: { point: geometry.point, meters } };
  } else {
    const summary = soort === 'archeologischonderzoeksgebied' ? 'alles wat hierin ligt, ook de vondsten, grondsporen en complexen in de vondstlocaties van dit gebied (containedInPlace of isPartOf)' : 'de objecten die hier direct in liggen (containedInPlace, locationCreated of spatialCoverage)';
    context = { soort, nummer, uri, clause: insideClause(uri), label: `${soortLabel(soort).toLowerCase()} “${naam || 'zonder naam'}” (${nummer})`, summary, geometry };
  }
  contexts.set(binnen, context);
  return context;
}
function setBinnen(binnen, extra = {}) {
  Object.assign(state, { binnen, page: 0 }, extra);
  syncForm(); run();
  window.scrollTo({ top: $('status').offsetTop - 16, behavior: 'smooth' });
}
// Eén object tonen via zijn nummer en soort (bijv. vanuit een relatie).
const showObject = (soort, nummer) => setBinnen(null, { query: `"${nummer}"`, field: 'Nummer', filters: { soort: [soort] }, sort: 'relevantie', jaar: null, locatie: false });
// Vanuit een resultaat naar wat erin ligt: met een schone zoekactie.
const openBinnen = binnen => setBinnen(binnen, { query: '', field: DEFAULT_FIELD, filters: {}, jaar: null, locatie: false });

function highlight(fragment) {
  const node = el('p', null, 'match');
  // Alleen de highlight-markeringen worden als element teruggezet; brontekst blijft tekst.
  for (const [index, part] of fragment.split(/(<mark>.*?<\/mark>)/gs).entries()) {
    const marked = index % 2 === 1;
    const parsed = new DOMParser().parseFromString(marked ? part.slice(6, -7) : part, 'text/html');
    const text = decode(parsed.body.textContent);
    node.append(marked ? el('mark', text) : document.createTextNode(text));
  }
  return node;
}
function relationRow(label, items) {
  const row = el('div', null, 'relation'); row.append(el('span', label, 'relation-label'));
  const list = el('span', null, 'relation-items'); list.append(...items); row.append(list); return row;
}
const metadataFields = { alternateName: 'Archis', temporalCoverage: 'Periode', material: 'Materiaal', keywords: 'Typegroep (ABR)', genre: 'Stijl en cultuur', materialExtent: 'Aantal', itemCondition: 'Toestand', category: 'Waardering', addressLocality: 'Plaats', addressRegion: 'Provincie', conditionsOfAccess: 'Toegang' };
// schema:keywords betekent per soort iets anders: bij vondstlocaties de wijze van verwerving, bij onderzoeksgebieden de AMK-indicatie.
const keywordsLabel = { vondstlocatie: 'Wijze van verwerving', archeologischonderzoeksgebied: 'Kenmerk' };
// Een korte omschrijving (vaak een Archis-code als 'ROM WSCH') staat direct op het kaartje, een lange in een uitklapblok.
const KORT = 120;
// Een naam "-" of zonder naam: kop op soort en plaats, bijv. "Onderzoeksgebied in Apeldoorn".
const kopVan = (source, soort) => {
  const naam = show(source[fields.name]);
  if (naam && naam !== '-') return naam;
  const plaats = values(source[fields.addressLocality])[0];
  return plaats ? `${soortLabel(soort)} in ${decode(plaats)}` : `${soortLabel(soort)} zonder naam`;
};
const locatieTekst = { vondstlocatie: 'vlak van het onderzoeksgebied (geen eigen locatie)', archeologischterrein: 'vlak van het rijksmonument (geen eigen locatie)' };
const geenLocatieTekst = { vondstlocatie: 'geen: deze vondstlocatie ligt niet in een onderzoeksgebied met een vlak', archeologischterrein: 'geen: dit terrein ligt niet in een rijksmonument', archeologischcomplex: 'geen eigen locatie (zie waar het in ligt)', grondsporen: 'geen eigen locatie (zie waar het in ligt)', vondsten: 'geen eigen locatie (zie waar het in ligt)' };
function renderResults(hits) {
  $('results').replaceChildren(); cards.clear(); relationSlots.clear();
  if (!hits.length) { $('results').append(el('p', 'Niets gevonden. Pas je zoekvraag aan of verwijder een filter.', 'empty')); return; }
  for (const hit of hits) {
    const source = hit._source || {}, soort = soortVan(source['@id']), nummer = values(source[fields.identifier])[0];
    const card = el('article'); card.dataset.id = hit._id; card.dataset.soort = soort ?? ''; cards.set(hit._id, card);
    card.addEventListener('click', event => { if (!event.target.closest('a, button, summary, details')) select(hit._id, true); });
    const head = el('p', null, 'number'); head.append(el('span', soortLabel(soort), 'badge'), document.createTextNode(` ${nummer ?? 'zonder nummer'}`));
    if (vertrouwelijk(source)) head.append(el('span', show(source[fields.conditionsOfAccess]), 'badge vertrouwelijk'));
    card.append(head, el('h3', kopVan(source, soort)));
    const metadata = el('dl', null, 'metadata');
    for (const [key, standaardLabel] of Object.entries(metadataFields)) {
      const label = key === 'keywords' ? keywordsLabel[soort] ?? standaardLabel : standaardLabel;
      let text = show(source[fields[key]]); if (!text || (key === 'conditionsOfAccess' && text === 'openbaar')) continue;
      // 9999 is in de bron "onbekend".
      if (key === 'materialExtent' && text === '9999') text = 'onbekend';
      // Periode met de jaartallen uit ABR erbij, bijv. Romeinse Tijd (12 v. Chr. – 449 n. Chr.).
      if (key === 'temporalCoverage') { const begin = Number(values(source[fields.startDate])[0]), eind = Number(values(source[fields.endDate])[0]); if (Number.isFinite(begin) && Number.isFinite(eind) && values(source[fields.startDate]).length) text += ` (${jaarTekst(begin)} – ${jaarTekst(eind)})`; }
      const row = el('div'); row.append(el('dt', `${label}:`), el('dd', text)); metadata.append(row);
    }
    // Waar staat het op de kaart? Een vondstlocatie of terrein leent het vlak van het onderzoeksgebied of rijksmonument;
    // complexen, grondsporen en vondsten hebben geen locatie.
    const locatie = geometryFor(source) ? locatieTekst[soort] : geenLocatieTekst[soort];
    if (locatie) { const row = el('div'); row.append(el('dt', 'Locatie:'), el('dd', locatie)); metadata.append(row); }
    const descriptions = values(source[fields.description]).map(decode);
    const kort = descriptions.length === 1 && descriptions[0].length <= KORT && !descriptions[0].includes('\n');
    if (kort) { const row = el('div', null, 'breed'); row.append(el('dt', 'Omschrijving:'), el('dd', descriptions[0])); metadata.append(row); }
    if (metadata.childElementCount) card.append(metadata);
    // Relaties: waar het in ligt en wat erin ligt; gevuld door loadRelations.
    const relations = el('div', null, 'relations');
    const slot = el('div'); relations.append(slot); relationSlots.set(hit._id, { slot, source, soort, nummer });
    card.append(relations);
    const fragments = Object.values(hit.highlight || {}).flat().slice(0, 3);
    fragments.forEach(fragment => card.append(highlight(fragment)));
    if (descriptions.length && !kort) { const detail = el('details'); detail.append(el('summary', 'Volledige omschrijving')); descriptions.forEach(text => detail.append(el('p', text, 'description'))); card.append(detail); }
    const links = el('div', null, 'links');
    for (const raw of values(source['@id'])) { const url = safeUrl(raw); if (url) { links.append(link('Linked Data', url)); const uri = el('p', null, 'uri'); uri.append(link(raw, url)); card.append(uri); } }
    // Het ABR-begrip van het type (vondsten, grondsporen, complexen).
    for (const raw of values(source[fields.sameAs])) { const url = safeUrl(raw); if (url && url.startsWith('https://data.cultureelerfgoed.nl/term/id/abr/')) links.append(link('ABR-begrip', url)); }
    if (map && geometryFor(source)) links.append(button('Toon op kaart', () => select(hit._id, true)));
    // Korte, deelbare link naar dit ene object.
    if (nummer) links.append(button('Link', event => kopieer(new URL(objectUrl(soort, nummer), location.href).href, event.currentTarget), 'link-kopie'));
    if (geometryFor(source) && nummer && MET_LOCATIE.includes(soort)) links.append(button('In de buurt', () => openBinnen(`rond:${soort}:${nummer}:500`)));
    card.append(links); $('results').append(card);
  }
}
// Eén extra request voor de hele pagina: de objecten waarin de resultaten liggen (naam en nummer), en per
// onderzoeksgebied, vondstlocatie of terrein hoeveel er in ligt, per soort. Rijksmonumenten (waarin een terrein
// ligt) staan in erfgoed-sdo; die komen tegelijk uit een tweede request naar die service.
async function loadRelations(hits, signal) {
  const parents = new Set(), containers = [];
  for (const { _source: source = {} } of hits) {
    for (const field of [...PARENT_FIELDS, fields.isPartOf]) values(source[field]).forEach(uri => parents.add(uri));
    if (MET_INHOUD.includes(soortVan(source['@id']))) containers.push(source['@id']);
  }
  if (!parents.size && !containers.length) return;
  const monumenten = [...parents].filter(uri => soortVan(uri) === 'rijksmonument');
  const eigen = [...parents].filter(uri => soortVan(uri) !== 'rijksmonument');
  let data, erfgoed;
  try {
    [data, erfgoed] = await Promise.all([
      search(buildRelationQuery(eigen, containers), signal),
      monumenten.length ? search(erfgoedQuery(monumenten), signal, ERFGOED_ENDPOINT).catch(error => { console.error('Erfgoed-sdo', error); return null; }) : null
    ]);
  } catch (error) { if (error.name !== 'AbortError') console.error('Relaties', error); return; }
  const byUri = new Map(data.hits.hits.map(({ _source: source }) => [source['@id'], source]));
  const monumentByUri = new Map((erfgoed?.hits.hits ?? []).map(({ _source: source }) => [source['@id'], source]));
  const inhoud = inhoudVan(data.aggregations);
  const objectButton = uri => {
    const soort = soortVan(uri);
    if (soort === 'rijksmonument') {
      // In de erfgoeddemo openen; zonder nummer (niet gevonden) alleen de Linked Data.
      const monument = monumentByUri.get(uri), nummer = monument && values(monument[fields.identifier])[0];
      const naam = monument && show(monument[fields.name]);
      if (nummer) { const node = link(`Rijksmonument ${nummer}${naam && naam !== '-' ? ` ${naam}` : ''}`, erfgoedDemoUrl(nummer)); node.className = 'relation-button'; node.title = 'Openen in de Erfgoed SDO/Elastic demo'; return node; }
      const url = safeUrl(uri);
      return url ? link('Rijksmonument (Linked Data)', url) : el('span', uri);
    }
    const source = byUri.get(uri), nummer = source && values(source[fields.identifier])[0];
    if (!source) { const url = safeUrl(uri); return url ? link(`${soortLabel(soort)} (Linked Data)`, url) : el('span', uri); }
    // Een naam "-" (komt in de bron voor) is geen naam.
    const naam = show(source[fields.name]), text = `${soortLabel(soort)} ${nummer ?? ''}${naam && naam !== '-' ? ` ${naam}` : ''}`.trim();
    return nummer ? button(text, () => showObject(soort, nummer), 'relation-button') : el('span', text);
  };
  const rij = (label, uris) => relationRow(label, uris.slice(0, 5).map(objectButton).concat(uris.length > 5 ? [el('span', `en ${uris.length - 5} meer`)] : []));
  for (const { slot, source, soort, nummer } of relationSlots.values()) {
    const ouders = PARENT_FIELDS.flatMap(field => values(source[field]));
    if (ouders.length) slot.append(rij('Ligt in:', ouders));
    const gebieden = values(source[fields.isPartOf]).filter(uri => !ouders.includes(uri));
    if (gebieden.length) slot.append(rij('Onderzoeksgebied:', gebieden));
    if (MET_INHOUD.includes(soort) && nummer) {
      const counts = inhoud.get(source['@id']);
      const parts = counts ? Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([key, count]) => aantalSoort(key, count)) : [];
      slot.append(relationRow('Bevat:', parts.length ? [document.createTextNode(`${parts.join(', ')} `), button('Toon wat erin ligt', () => openBinnen(`${soort}:${nummer}`), 'relation-button')] : [el('span', 'geen objecten in deze index')]));
    }
  }
}
function markerIcon(number, soort, selected) {
  // Alleen het nummer als label, als tekst (geen HTML uit de bron).
  const label = el('span', number, selected ? 'selected' : null);
  label.style.setProperty('--kleur', colors[soort] ?? colors.vondstlocatie);
  return L.divIcon({ className: 'label-marker', html: label, iconSize: [0, 0] });
}
const isArea = soort => soort === 'archeologischonderzoeksgebied';
const shapeStyle = (soort, selected) => ({ color: selected ? '#000000' : colors[soort] ?? colors.vondstlocatie, fillColor: selected ? '#ffb612' : colors[soort] ?? colors.vondstlocatie, weight: selected ? 3 : 2, fillOpacity: selected ? 0.45 : isArea(soort) ? 0.08 : 0.2 });
function renderContextGeometry(context) {
  if (!map) return;
  contextLayer.clearLayers();
  // Het gekozen object of de cirkel bij "in de buurt", als zwarte stippellijn zonder vulling.
  const style = { color: '#000', weight: 2, dashArray: '6 6', fill: false, interactive: false };
  if (context?.circle) contextLayer.addLayer(L.circle([context.circle.point.lat, context.circle.point.lon], { ...style, radius: context.circle.meters }));
  else if (context?.geometry?.polygons) contextLayer.addLayer(L.polygon(context.geometry.polygons, style));
}
function renderMap(hits) {
  if (!map) return 0;
  markerLayer.clearLayers(); markers.clear(); shapes.clear();
  const counts = { punt: 0, vlak: 0 };
  for (const hit of hits) {
    const geometry = geometryFor(hit._source);
    if (!geometry) continue;
    const soort = soortVan(hit._source?.['@id']);
    const number = textValue(hit._source?.[fields.identifier]) || '?';
    if (geometry.polygons) {
      const shape = L.polygon(geometry.polygons, shapeStyle(soort, false)).on('click', () => select(hit._id, false));
      shape.soort = soort; shapes.set(hit._id, shape); markerLayer.addLayer(shape);
    }
    const marker = L.marker([geometry.point.lat, geometry.point.lon], { icon: markerIcon(number, soort, false), title: `${soortLabel(soort)} ${number}`, keyboard: true });
    marker.on('click', () => select(hit._id, false));
    marker.number = number; marker.soort = soort;
    markers.set(hit._id, marker); markerLayer.addLayer(marker); counts[geometry.kind]++;
  }
  // Onderzoeksgebieden onderop, zodat kleinere vlakken klikbaar blijven.
  for (const shape of shapes.values()) if (isArea(shape.soort)) shape.bringToBack();
  const total = counts.punt + counts.vlak;
  needsFit = total > 0 || contextLayer.getLayers().length > 0; fitMarkers();
  $('map-info').replaceChildren();
  if (!hits.length) $('map-info').textContent = 'Geen resultaten om op de kaart te tonen.';
  else {
    $('map-info').append(document.createTextNode(`Op de kaart: ${total} van de ${hits.length} getoonde resultaten. `));
    if (total < hits.length) $('map-info').append(document.createTextNode(total ? 'De andere hebben geen locatie. ' : 'Deze resultaten hebben geen locatie. '));
    if (total < hits.length && !state.locatie) $('map-info').append(button('Toon alleen resultaten met een locatie', () => { state.locatie = true; state.page = 0; syncForm(); run(); }, 'link-button'));
  }
  return total;
}
// Een verborgen kaart heeft geen afmetingen; pas passend inzoomen zodra de kaart zichtbaar is.
function fitMarkers() {
  if (!needsFit || !$('map').offsetWidth) return;
  const bounds = markerLayer.getBounds();
  if (contextLayer.getLayers().length) bounds.extend(contextLayer.getBounds());
  if (!bounds.isValid()) return;
  map.invalidateSize(); map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 }); needsFit = false;
}
function setView(view) {
  $('workspace').dataset.view = view;
  document.querySelectorAll('.view-toggle button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.view === view)));
  if (view === 'map' && map) { map.invalidateSize(); fitMarkers(); }
}
// Selecteer een resultaat: markeer de kaart en het resultaat; vanuit de lijst vliegt de kaart naar het object.
function select(id, fromList) {
  for (const [key, card] of cards) card.classList.toggle('selected', key === id);
  for (const [key, marker] of markers) { marker.setIcon(markerIcon(marker.number, marker.soort, key === id)); marker.setZIndexOffset(key === id ? 1000 : 0); }
  for (const [key, shape] of shapes) { shape.setStyle(shapeStyle(shape.soort, key === id)); if (key === id && !isArea(shape.soort)) shape.bringToFront(); }
  const marker = markers.get(id);
  if (fromList) {
    if (!marker) return;
    if (!wide.matches) setView('map');
    needsFit = false;
    if (shapes.has(id)) map.flyToBounds(shapes.get(id).getBounds(), { padding: [40, 40], maxZoom: 18, duration: 0.8 });
    else map.flyTo(marker.getLatLng(), Math.max(map.getZoom(), 17), { duration: 0.8 });
  } else {
    if (!wide.matches) setView('list');
    cards.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
const isActive = (key, value) => state.filters[key]?.includes(value) ?? false;
function toggleFilter(key, value) {
  const list = state.filters[key] ?? [];
  state.filters[key] = list.includes(value) ? list.filter(item => item !== value) : [...list, value];
  if (!state.filters[key].length) delete state.filters[key];
  state.page = 0; run();
}
const valueLabel = (key, value) => (key === 'soort' ? soorten[value] ?? value : decode(value));
function renderFilters(aggregations, context) {
  $('active-filters').replaceChildren();
  if (state.binnen) {
    const chip = button(`Binnen: ${context?.label ?? state.binnen} ×`, () => setBinnen(null)); chip.className = 'chip-binnen';
    chip.setAttribute('aria-label', `Verwijder ${context?.label ?? state.binnen}`); $('active-filters').append(chip);
  }
  if (state.locatie) {
    const chip = button('Alleen met locatie op de kaart ×', () => { state.locatie = false; state.page = 0; syncForm(); run(); });
    chip.setAttribute('aria-label', 'Verwijder het filter op locatie'); $('active-filters').append(chip);
  }
  if (state.jaar) {
    const chip = button(`Datering: ${state.jaar.modus === 'binnen' ? 'helemaal' : '(deels)'} in ${jaarBereik(state.jaar).replace(/^de periode /, '')} ×`, () => { state.jaar = null; state.page = 0; syncForm(); run(); });
    chip.setAttribute('aria-label', 'Verwijder het filter op datering'); $('active-filters').append(chip);
  }
  for (const [key, list] of Object.entries(state.filters)) for (const value of list) {
    const chip = button(`${facets[key]}: ${valueLabel(key, value)} ×`, () => toggleFilter(key, value));
    chip.setAttribute('aria-label', `Verwijder filter ${facets[key]}: ${valueLabel(key, value)}`); $('active-filters').append(chip);
  }
  if (Object.keys(state.filters).length || state.binnen || state.jaar || state.locatie) $('active-filters').append(button('Wis alle filters', () => { state.filters = {}; state.binnen = null; state.jaar = null; state.locatie = false; state.page = 0; syncForm(); run(); }));
  // Standaard zonder vondsten en grondsporen: maak dat zichtbaar en omkeerbaar.
  // Bij bladeren zonder zoekvraag: zeg hoeveel vondsten en grondsporen er niet getoond worden.
  if (verbergt(state)) {
    const perSoort = Object.fromEntries((bucketsOf(aggregations.soort)?.buckets ?? []).map(({ key, doc_count }) => [key, doc_count]));
    const delen = VERBORGEN.filter(soort => perSoort[soort]).map(soort => aantalSoort(soort, perSoort[soort]));
    const tekst = delen.length ? `${delen.join(' en ')} niet getoond (zonder zoekvraag staan die standaard uit).` : 'Vondsten en grondsporen staan zonder zoekvraag standaard uit.';
    $('active-filters').append(el('span', `${tekst} `, 'hint'), button('Toon alle soorten', () => { state.filters.soort = Object.keys(soorten); state.page = 0; run(); }, 'link-button'));
  }
  $('facets').replaceChildren();
  for (const [key, label] of Object.entries(facets)) {
    const group = el('details'); group.open = ['soort', 'temporalCoverage', 'material', 'addressRegion'].includes(key);
    const selected = state.filters[key]?.length;
    group.append(el('summary', selected ? `${label} (${selected} gekozen)` : label));
    const aggregation = bucketsOf(aggregations[key]);
    if (!aggregation) { group.append(el('p', 'Deze facet is niet beschikbaar.', 'hint')); $('facets').append(group); continue; }
    // Gekozen waarden blijven zichtbaar, ook als ze niet bij de 100 meest voorkomende horen.
    const buckets = [...aggregation.buckets];
    for (const value of state.filters[key] ?? []) if (!buckets.some(bucket => bucket.key === value)) buckets.unshift({ key: value, doc_count: null });
    const list = el('ul', null, 'facet-list');
    for (const bucket of buckets) {
      const item = el('li'), option = el('label', null, 'facet-option'), box = el('input');
      box.type = 'checkbox'; box.checked = isActive(key, bucket.key); box.addEventListener('change', () => toggleFilter(key, bucket.key));
      const approximate = bucket.doc_count_error_upper_bound > 0;
      const name = el('span', valueLabel(key, bucket.key), 'facet-name');
      if (key === 'soort') { name.dataset.soort = bucket.key; if (verbergt(state) && VERBORGEN.includes(bucket.key)) name.append(el('span', ' (niet getoond)', 'muted')); }
      option.append(box, name, el('span', bucket.doc_count == null ? '' : `${approximate ? '≈ ' : ''}${format(bucket.doc_count)}`, 'facet-count'));
      item.append(option); list.append(item);
    }
    group.append(list);
    if (!buckets.length) group.append(el('p', 'Geen waarden bij deze zoekvraag.', 'hint'));
    if (aggregation.sum_other_doc_count > 0) group.append(el('p', 'De 100 meest voorkomende waarden. Verfijn je zoekvraag voor andere waarden.', 'hint'));
    $('facets').append(group);
  }
}
// Zoekformulier, URL en uitleg volgen de state.
function syncForm() {
  $('query').value = state.query; $('field').value = state.field; $('sort').value = state.sort; checkQuery();
  $('locatie').checked = state.locatie === true;
  $('van').value = state.jaar?.van ?? ''; $('tot').value = state.jaar?.tot ?? ''; $('jaarmodus').value = state.jaar?.modus ?? 'overlapt';
}
// Datering uit het formulier; null als beide velden leeg zijn. Gooit een fout bij een ongeldig jaartal.
function readJaar() {
  const read = id => { const raw = $(id).value.trim(); if (!raw) return null; const value = Number(raw); if (!Number.isInteger(value) || value < JAAR_MIN || value > JAAR_MAX) throw new Error(`Vul bij ${id === 'van' ? 'Van' : 'tot'} een heel jaartal in (negatief is v. Chr.).`); return value; };
  const van = read('van'), tot = read('tot');
  if (van == null && tot == null) return null;
  if (van != null && tot != null && van > tot) throw new Error('Het jaartal bij Van moet vóór het jaartal bij tot liggen.');
  return { van, tot, modus: $('jaarmodus').value === 'binnen' ? 'binnen' : 'overlapt' };
}
function syncUrl(mode) {
  const params = toParams(state);
  if (service !== DEFAULT_SERVICE) params.set('service', service);
  const query = params.toString();
  const url = `${location.pathname}${query ? `?${query}` : ''}`;
  if (mode === 'push' && url !== `${location.pathname}${location.search}`) history.pushState(null, '', url);
  else if (mode === 'replace') history.replaceState(null, '', url);
}
function explain(context) {
  const lines = describe(state, context?.label);
  $('explain').textContent = lines.slice(0, -1).join(' · ');
  $('explain').hidden = !$('explain').textContent;
  $('query-explain').replaceChildren(...lines.map(line => el('li', line)));
}
function renderContext(context) {
  $('context').replaceChildren(); $('context').hidden = !context;
  if (!context) return;
  const text = el('p'); text.append(el('strong', `Binnen ${context.label}`), document.createTextNode(`: ${context.summary}.`));
  const actions = el('div', null, 'links');
  if (context.meters) {
    const distance = el('select'); distance.setAttribute('aria-label', 'Afstand');
    for (const meters of AFSTANDEN) { const option = el('option', `${format(meters)} m`); option.value = meters; option.selected = meters === context.meters; distance.append(option); }
    distance.addEventListener('change', () => setBinnen(`rond:${context.soort}:${context.nummer}:${distance.value}`));
    actions.append(distance);
  }
  const url = safeUrl(context.uri); if (url) actions.append(link('Linked Data', url));
  actions.append(button(`Toon ${soortLabel(context.soort).toLowerCase()} ${context.nummer} zelf`, () => showObject(context.soort, context.nummer)), button('Weer overal zoeken', () => setBinnen(null)));
  $('context').append(text, actions);
}
async function run(urlMode = 'push') {
  controller?.abort(); const current = new AbortController(); controller = current;
  syncUrl(urlMode);
  $('error').hidden = true; $('status').textContent = 'Zoeken…'; $('workspace').setAttribute('aria-busy', 'true');
  $('results').replaceChildren(); renderMap([]); $('map-info').textContent = 'Zoeken…'; $('facets').replaceChildren(); $('active-filters').replaceChildren(); $('pagination').hidden = true; $('page-info').textContent = ''; $('export').disabled = true; $('export-info').textContent = '';
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; current.abort(); }, 20000);
  let context = null;
  try {
    context = await resolveContext(state.binnen);
    if (controller !== current) return;
    const body = buildQuery(state, context);
    $('query-json').textContent = JSON.stringify(body, null, 2); explain(context); renderContext(context);
    renderContextGeometry(context);
    const data = await search(body, current.signal);
    if (controller !== current) return;
    const total = typeof data.hits.total === 'number' ? data.hits.total : data.hits.total.value;
    const exact = typeof data.hits.total === 'number' || data.hits.total.relation === 'eq';
    const hits = data.hits.hits;
    renderResults(hits); renderFilters(data.aggregations, context);
    const onMap = renderMap(hits);
    loadRelations(hits, current.signal);
    $('status').textContent = `Totaal gevonden: ${exact ? '' : 'minimaal '}${format(total)} | Getoond: ${hits.length}${map ? ` | Op kaart: ${onMap}` : ''}`;
    $('page-info').textContent = hits.length ? `${format(state.page * PAGE_SIZE + 1)} tot ${format(state.page * PAGE_SIZE + hits.length)}` : '';
    $('pagination').hidden = total <= PAGE_SIZE;
    $('previous').disabled = state.page === 0;
    $('next').disabled = (state.page + 1) * PAGE_SIZE >= Math.min(total, MAX_WINDOW);
    $('page-number').textContent = `Pagina ${state.page + 1} van ${Math.max(1, Math.ceil(Math.min(total, MAX_WINDOW) / PAGE_SIZE))}`;
    lastTotal = total; $('export').disabled = total === 0;
    if (total > MAX_WINDOW) $('results').append(el('p', 'Je kunt maximaal de eerste 10.000 resultaten bekijken. Verfijn je zoekvraag voor de overige resultaten.', 'hint'));
  } catch (error) {
    if (controller !== current) return;
    $('status').textContent = 'Zoeken niet gelukt.';
    $('error').textContent = timedOut ? 'De zoekopdracht duurde te lang. Verfijn je zoekvraag en probeer opnieuw.' : error instanceof TypeError ? 'De zoekservice is niet bereikbaar. Controleer je verbinding en probeer opnieuw.' : error.message;
    $('error').hidden = false;
    renderFilters({}, context); renderMap([]);
  } finally { clearTimeout(timer); if (controller === current) $('workspace').setAttribute('aria-busy', 'false'); }
}
// Beginsituatie bewaren, zodat "Opnieuw beginnen" de pagina terugzet zonder te herladen.
const initial = Object.fromEntries(['status', 'facets', 'results', 'query-json', 'query-explain', 'map-info'].map(id => [id, [...$(id).childNodes].map(node => node.cloneNode(true))]));
function reset() {
  controller?.abort(); controller = undefined;
  Object.assign(state, blank()); syncForm(); syncUrl('push');
  $('explain').hidden = true; $('context').hidden = true; $('export').disabled = true; $('export-info').textContent = '';
  for (const [id, nodes] of Object.entries(initial)) $(id).replaceChildren(...nodes.map(node => node.cloneNode(true)));
  $('active-filters').replaceChildren(); $('page-info').textContent = ''; $('pagination').hidden = true; $('error').hidden = true;
  $('workspace').setAttribute('aria-busy', 'false'); cards.clear();
  if (map) { markerLayer.clearLayers(); contextLayer.clearLayers(); markers.clear(); shapes.clear(); needsFit = false; map.setView([52.2, 5.3], 7); }
  setView('list'); $('query').focus();
}
$('reset').addEventListener('click', reset);
$('search-form').addEventListener('submit', event => {
  event.preventDefault();
  try { state.jaar = readJaar(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; $('van').focus(); return; }
  state.query = $('query').value; state.field = $('field').value; state.page = 0;
  syncForm(); run();
});
$('locatie').addEventListener('change', () => { state.locatie = $('locatie').checked; state.page = 0; if ($('query-json').textContent.startsWith('{')) run(); });
$('sort').addEventListener('change', () => { state.sort = $('sort').value; state.page = 0; if ($('query-json').textContent.startsWith('{')) run(); });
document.querySelectorAll('[data-example]').forEach(node => node.addEventListener('click', () => {
  $('help').close();
  const filters = {};
  if (node.dataset.soort) filters.soort = node.dataset.soort.split(',');
  if (node.dataset.periode) filters.temporalCoverage = [node.dataset.periode];
  if (node.dataset.groep) filters.material = [node.dataset.groep];
  const jaar = node.dataset.van || node.dataset.tot ? { van: node.dataset.van ? Number(node.dataset.van) : null, tot: node.dataset.tot ? Number(node.dataset.tot) : null, modus: node.dataset.jaarmodus === 'binnen' ? 'binnen' : 'overlapt' } : null;
  Object.assign(state, { query: node.dataset.example, field: DEFAULT_FIELD, page: 0, binnen: node.dataset.binnen ?? null, filters, jaar, locatie: false });
  syncForm(); run();
}));
$('help-open').addEventListener('click', () => $('help').showModal());
document.querySelectorAll('[data-help]').forEach(node => node.addEventListener('click', () => { $('help').showModal(); $(`help-${node.dataset.help}`)?.scrollIntoView({ block: 'start' }); }));
$('help-close').addEventListener('click', () => $('help').close());
$('help').addEventListener('click', event => { if (event.target === $('help')) $('help').close(); });
// Tip bij operatoren in kleine letters of Nederlandse varianten: die worden als gewone zoekwoorden gezien.
function checkQuery() {
  const words = [...new Set(($('query').value.replace(/"[^"]*"/g, ' ').match(/(?<![\p{L}\d])(and|or|not|en|of|niet)(?![\p{L}\d])/gu) || []))];
  const operator = { and: 'AND', en: 'AND', or: 'OR', of: 'OR', not: 'NOT', niet: 'NOT' };
  $('query-tip').textContent = words.length ? `Tip: ${words.map(word => `“${word}”`).join(', ')} wordt als zoekwoord gezien. Bedoel je ${[...new Set(words.map(word => operator[word]))].join(' / ')}? Schrijf operatoren in hoofdletters.` : '';
  $('query-tip').hidden = !words.length;
}
$('query').addEventListener('input', checkQuery);
$('previous').addEventListener('click', () => { state.page--; run(); });
$('next').addEventListener('click', () => { state.page++; run(); });
document.querySelectorAll('.view-toggle button').forEach(node => node.addEventListener('click', () => setView(node.dataset.view)));
wide.addEventListener('change', () => { if (map) { map.invalidateSize(); fitMarkers(); } });
// Deelbare link: de URL bevat altijd de huidige zoekactie.
$('share').addEventListener('click', event => kopieer(location.href, event.currentTarget));
// CSV-export: dezelfde zoekactie, maximaal EXPORT_MAX rijen.
$('export').addEventListener('click', async () => {
  $('export').disabled = true; $('export-info').textContent = 'Export wordt gemaakt…';
  try {
    const data = await search(buildExportQuery(state, contexts.get(state.binnen)), AbortSignal.timeout(30000));
    const blob = new Blob([toCsv(data.hits.hits, decode)], { type: 'text/csv;charset=utf-8' });
    const anchor = el('a'); anchor.href = URL.createObjectURL(blob); anchor.download = `archeologie-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 1000);
    $('export-info').textContent = lastTotal > EXPORT_MAX ? `De export bevat de eerste ${format(EXPORT_MAX)} van ${format(lastTotal)} resultaten.` : `${format(data.hits.hits.length)} resultaten geëxporteerd.`;
  } catch (error) {
    console.error(error); $('export-info').textContent = 'Exporteren is niet gelukt. Probeer het opnieuw.';
  } finally { $('export').disabled = false; }
});
for (const [key, { label }] of Object.entries(sorts)) { const option = el('option', label); option.value = key; $('sort').append(option); }
$('export').textContent = `Download CSV (max. ${format(EXPORT_MAX)})`;
if (service !== DEFAULT_SERVICE) $('service-info').textContent = `Testmodus: zoekt in service “${service}”.`;
// Zoekactie uit de URL laden: bij openen van een gedeelde link en bij terug/vooruit in de browser.
function loadFromUrl() {
  const { state: next, active } = fromParams(location.search);
  Object.assign(state, next); syncForm();
  if (active || next.sort !== 'relevantie') run('replace'); else reset();
}
window.addEventListener('popstate', loadFromUrl);
if (location.search) loadFromUrl();
