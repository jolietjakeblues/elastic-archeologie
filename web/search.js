import { WKT_FIELD } from './geo.js';
// De service kan voor een test worden overschreven met ?service=<naam> (alleen services van rce/archeologie-sdo).
export const DATASET = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/archeologie-sdo/services/';
export const DEFAULT_SERVICE = 'Archeologie-sdo-abr';
export const SERVICE = /^[\w-]{1,64}$/;
let service = DEFAULT_SERVICE;
export const setService = name => { service = SERVICE.test(name ?? '') ? name : DEFAULT_SERVICE; return service; };
export const endpoint = () => `${DATASET}${service}/_search`;
export const PAGE_SIZE = 25;
export const MAX_WINDOW = 10000;
export const EXPORT_MAX = 1000;
const MAX_VALUES = 20;
export const BASE = 'https://linkeddata.cultureelerfgoed.nl/cho-kennis/id/';
export const fields = Object.fromEntries(['description', 'name', 'alternateName', 'addressLocality', 'addressRegion', 'category', 'additionalType', 'identifier', 'temporalCoverage', 'material', 'genre', 'materialExtent', 'itemCondition', 'conditionsOfAccess', 'keywords', 'containedInPlace', 'locationCreated', 'spatialCoverage', 'isPartOf', 'sameAs', 'startDate', 'endDate'].map(key => [key, `https://schema org/${key}`]));
// De soort staat alleen in de URI: …/id/vondstlocatie/…, …/id/vondsten/… enzovoort.
export const soorten = { archeologischonderzoeksgebied: 'Onderzoeksgebied', vondstlocatie: 'Vondstlocatie', archeologischterrein: 'Archeologisch terrein', archeologischcomplex: 'Archeologisch complex', grondsporen: 'Grondspoor', vondsten: 'Vondst' };
// Objecten buiten deze index waarnaar verwezen kan worden (een terrein ligt in een rijksmonument uit erfgoed-sdo).
export const extern = { rijksmonument: 'Rijksmonument' };
export const soortVan = uri => /\/id\/([a-z]+)\//.exec(String(uri ?? ''))?.[1] ?? null;
// Vondsten en grondsporen zijn samen ca. 540.000 van de 1,1 miljoen objecten. Zonder soortfilter en buiten een
// context worden ze daarom niet getoond; in de soortfacet blijven ze zichtbaar en aan te vinken.
export const VERBORGEN = ['vondsten', 'grondsporen'];
export const STANDAARD_SOORTEN = Object.keys(soorten).filter(soort => !VERBORGEN.includes(soort));
// @id.soort is een keyword-subveld uit de index template (triply/elastic-service-archeologie.json): de soort uit de URI.
const SOORT_FIELD = '@id.soort';
// Waar een object in ligt: een vondstlocatie of complex (containedInPlace), een grondspoor (locationCreated) of een vondst (spatialCoverage).
export const PARENT_FIELDS = [fields.containedInPlace, fields.locationCreated, fields.spatialCoverage];
// Indirect: vondsten, grondsporen en complexen in een vondstlocatie hebben ook het onderzoeksgebied van die
// vondstlocatie (isPartOf). "Binnen een onderzoeksgebied" vindt daardoor alle niveaus.
export const INSIDE_FIELDS = [...PARENT_FIELDS, fields.isPartOf];
// Rijksmonumenten (waarin een terrein ligt) staan in erfgoed-sdo; nummer en naam komen uit die service, de link
// gaat naar de erfgoeddemo.
export const ERFGOED_ENDPOINT = 'https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/erfgoed-sdo/services/Erfgoed-sdo-nl3/_search';
export const ERFGOED_DEMO = 'https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/';
export const searchFields = {
  Alles: ['name', 'alternateName', 'description', 'addressLocality', 'addressRegion', 'category', 'temporalCoverage', 'material', 'genre', 'keywords', 'identifier'].map(key => fields[key]),
  Omschrijving: [fields.description], Naam: [fields.name], Plaats: [fields.addressLocality],
  Periode: [fields.temporalCoverage], Materiaal: [fields.material], Nummer: [fields.identifier, fields.alternateName],
  // Zonder stemming, samenstellingen en synoniemen (subveld .exact; plaats en provincie zijn al exact). Accenten tellen niet mee.
  Exact: [...['name', 'alternateName', 'description', 'category', 'temporalCoverage', 'material', 'genre'].map(key => `${fields[key]}.exact`), ...['addressLocality', 'addressRegion', 'identifier'].map(key => fields[key])]
};
export const DEFAULT_FIELD = 'Alles';
// Weging: een treffer in de naam (bij vondsten, sporen en complexen het type) telt WEIGHT keer zo zwaar.
export const WEIGHT = 3;
const WEIGHTED = [fields.name];
const weighted = key => WEIGHTED.some(base => key === base || key === `${base}.exact`);
export function queryFields(field) {
  return field === 'Alles' || field === 'Exact' ? searchFields[field].map(key => (weighted(key) ? `${key}^${WEIGHT}` : key)) : searchFields[field];
}
export const facets = { soort: 'Soort', name: 'Naam of type', keywords: 'Typegroep (ABR) of kenmerk', temporalCoverage: 'Periode', material: 'Materiaal (met groepen)', genre: 'Stijl en cultuur', category: 'Waardering', addressRegion: 'Provincie', addressLocality: 'Plaats', conditionsOfAccess: 'Toegang' };
// Sorteren op nummer gebruikt identifier.getal (long); het gewone veld is tekst, dan komt 5 na 10040.
export const sorts = {
  relevantie: { label: 'Relevantie', sort: null },
  naam: { label: 'Naam of type (A–Z)', sort: [{ [`${fields.name}.keyword`]: { order: 'asc', missing: '_last' } }, '_score'] },
  plaats: { label: 'Plaats (A–Z)', sort: [{ [`${fields.addressLocality}.keyword`]: { order: 'asc', missing: '_last' } }, { [`${fields.name}.keyword`]: { order: 'asc', missing: '_last' } }] },
  // Chronologisch op het beginjaar uit ABR (startDate.getal, long), dan het eindjaar; zonder datering achteraan.
  periode: { label: 'Periode (oud → jong)', sort: [{ [`${fields.startDate}.getal`]: { order: 'asc', missing: '_last' } }, { [`${fields.endDate}.getal`]: { order: 'asc', missing: '_last' } }] },
  soort: { label: 'Soort', sort: [{ '@id.keyword': { order: 'asc' } }] },
  nummer: { label: 'Nummer', sort: [{ [`${fields.identifier}.getal`]: { order: 'asc', missing: '_last' } }] }
};
// "Binnen": een context voor de zoekactie.
//   archeologischonderzoeksgebied:2041587, vondstlocatie:6129412, archeologischterrein:6046656
//                                       wat erin ligt volgens de relaties (containedInPlace, locationCreated, spatialCoverage,
//                                       en isPartOf voor alles in een onderzoeksgebied via een vondstlocatie)
//   rond:vondstlocatie:6129412:500      alles met een geometrie binnen 500 m van een object (geo_distance)
export const AFSTANDEN = [100, 250, 500, 1000, 2000];
export const MET_INHOUD = ['archeologischonderzoeksgebied', 'vondstlocatie', 'archeologischterrein'];
export const MET_LOCATIE = ['archeologischonderzoeksgebied', 'vondstlocatie', 'archeologischterrein'];
export const BINNEN = new RegExp(`^((${MET_INHOUD.join('|')}):\\d{1,10}|rond:(${MET_LOCATIE.join('|')}):\\d{1,10}:(${AFSTANDEN.join('|')}))$`);
const notItself = uri => [{ term: { '@id.keyword': uri } }];
export const insideClause = uri => ({ bool: { should: INSIDE_FIELDS.map(field => ({ term: { [`${field}.keyword`]: uri } })), minimum_should_match: 1 } });
export const nearClause = ({ lat, lon }, meters, uri) => ({ bool: { filter: [{ geo_distance: { distance: `${meters}m`, [WKT_FIELD]: { lat, lon } } }], must_not: notItself(uri) } });
// Jaartallen uit ABR: startDate = beginjaar van de beginperiode, endDate = eindjaar van de eindperiode; negatief = v. Chr.
// jaar = { van, tot, modus }: 'overlapt' (de datering valt deels in het bereik) of 'binnen' (helemaal erin).
// Brede dateringen (bijv. Prehistorie - Nieuwe Tijd, -1.000.000 tot 1945) overlappen met bijna elk bereik.
export const JAAR_MIN = -1000000, JAAR_MAX = 2100;
export const jaarTekst = jaar => (jaar < 0 ? `${new Intl.NumberFormat('nl-NL').format(-jaar)} v. Chr.` : `${jaar} n. Chr.`);
export const JAARMODI = { overlapt: '(deels)', binnen: 'helemaal' };
export const jaarBereik = ({ van = null, tot = null } = {}) => (van != null && tot != null ? `de periode ${jaarTekst(van)} – ${jaarTekst(tot)}` : van != null ? `de periode vanaf ${jaarTekst(van)}` : `de periode tot ${jaarTekst(tot)}`);
const geldigJaar = value => value == null || (Number.isInteger(value) && value >= JAAR_MIN && value <= JAAR_MAX);
export function jaarClause({ van = null, tot = null, modus = 'overlapt' } = {}) {
  const start = `${fields.startDate}.getal`, eind = `${fields.endDate}.getal`;
  const filter = modus === 'binnen'
    ? [van != null && { range: { [start]: { gte: van } } }, tot != null && { range: { [eind]: { lte: tot } } }]
    : [tot != null && { range: { [start]: { lte: tot } } }, van != null && { range: { [eind]: { gte: van } } }];
  return { bool: { filter: filter.filter(Boolean) } };
}
// Filters zijn { facet: [waarden] }: binnen één facet OF, tussen facetten EN.
function clauseFor(key, list) {
  if (key === 'soort') return { terms: { [SOORT_FIELD]: list } };
  return { terms: { [`${fields[key]}.keyword`]: list } };
}
// Zonder soortfilter en zonder context: de standaardsoorten (dus zonder vondsten en grondsporen).
export const verbergt = ({ filters = {}, binnen = null }) => !binnen && !filters.soort?.length;
function filterClauses(filters, skip, binnen) {
  const clauses = Object.entries(filters).filter(([key, list]) => key !== skip && list.length).map(([key, list]) => clauseFor(key, list));
  if (skip !== 'soort' && verbergt({ filters, binnen })) clauses.push(clauseFor('soort', STANDAARD_SOORTEN));
  return clauses;
}
function validate({ query = '', field = DEFAULT_FIELD, filters = {}, page = 0, sort = 'relevantie', jokers = false, binnen = null, jaar = null }, context) {
  if (!Object.hasOwn(searchFields, field)) throw new Error('Onbekend zoekveld.');
  if (!Object.hasOwn(sorts, sort)) throw new Error('Onbekende sortering.');
  if (!Number.isInteger(page) || page < 0 || (page + 1) * PAGE_SIZE > MAX_WINDOW) throw new Error('Verfijn je zoekvraag om meer resultaten te bekijken.');
  if (typeof query !== 'string' || query.length > 500) throw new Error('Gebruik maximaal 500 tekens in je zoekvraag.');
  if (binnen != null && (!BINNEN.test(binnen) || !context?.clause)) throw new Error('Onbekend gebied of object.');
  const clean = {};
  for (const [key, value] of Object.entries(filters)) {
    const list = Array.isArray(value) ? value : [value];
    if (!Object.hasOwn(facets, key) || list.length > MAX_VALUES || !list.every(item => typeof item === 'string' && item.length <= 300)) throw new Error('Ongeldig filter.');
    if (key === 'soort' && !list.every(item => Object.hasOwn(soorten, item))) throw new Error('Ongeldig filter.');
    if (list.length) clean[key] = [...new Set(list)];
  }
  if (jaar != null && (!geldigJaar(jaar.van) || !geldigJaar(jaar.tot) || (jaar.van == null && jaar.tot == null) || !Object.hasOwn(JAARMODI, jaar.modus ?? 'overlapt'))) throw new Error('Ongeldig jaartal.');
  if (jaar?.van != null && jaar?.tot != null && jaar.van > jaar.tot) throw new Error('Het beginjaar moet vóór het eindjaar liggen.');
  const text = query.trim() ? { query_string: { query: query.trim(), fields: queryFields(field), allow_leading_wildcard: jokers === true } } : { match_all: {} };
  // Context (binnen) en jaartal gaan in de query: ze beperken ook de facetten en de totalen.
  const filter = [binnen && context.clause, jaar && jaarClause(jaar)].filter(Boolean);
  const search = filter.length ? { bool: { must: [text], filter } } : text;
  return { search, filters: clean, field, page, sort, binnen };
}
const facetAggs = (filters, binnen) => Object.fromEntries(Object.keys(facets).map(key => [key, {
  filter: { bool: { filter: filterClauses(filters, key, binnen) } },
  aggs: { values: key === 'soort'
    ? { terms: { field: SOORT_FIELD, size: 20 } }
    : { terms: { field: `${fields[key]}.keyword`, size: 100, show_term_doc_count_error: true } } }
}]));
// Zoeken (query) en filteren (post_filter) blijven gescheiden. Elke facet telt met de filters van de andere
// facetten, zodat je binnen een facet meerdere waarden kunt aanvinken.
// context = { clause } voor "binnen"; die beperkt ook de facetten.
export function buildQuery(state = {}, context) {
  const { search, filters, field, page, sort, binnen } = validate(state, context);
  return {
    from: page * PAGE_SIZE, size: PAGE_SIZE, track_total_hits: true, timeout: '15s',
    _source: ['@id', ...Object.values(fields), WKT_FIELD],
    query: search,
    post_filter: { bool: { filter: filterClauses(filters, null, binnen) } },
    ...(sorts[sort].sort ? { sort: sorts[sort].sort } : {}),
    // Highlighting zonder ^3: daar is het gewicht geen deel van de veldnaam.
    highlight: { fields: Object.fromEntries(searchFields[field].map(key => [key, { fragment_size: 275, number_of_fragments: 3 }])), pre_tags: ['<mark>'], post_tags: ['</mark>'], encoder: 'html' },
    aggs: facetAggs(filters, binnen)
  };
}
// Facetbuckets in één vorm.
export function bucketsOf(aggregation) {
  const values = aggregation?.values;
  if (!values) return null;
  if (Array.isArray(values.buckets)) return values;
  return { buckets: Object.entries(values.buckets).map(([key, { doc_count }]) => ({ key, doc_count })).filter(bucket => bucket.doc_count > 0), sum_other_doc_count: 0 };
}
// Relaties van de resultaten op deze pagina in één request:
// - de objecten waarin ze liggen (namen en nummers), via hun URI;
// - per onderzoeksgebied, vondstlocatie of terrein hoeveel er in ligt, per soort (een filters-aggregation met per
//   object dezelfde clause als "Toon wat erin ligt", zodat een object dat via twee velden matcht één keer telt).
export function buildRelationQuery(parents, containers) {
  const list = items => (items.length ? items : ['-']);
  const parentClause = { terms: { '@id.keyword': list(parents) } };
  return {
    size: Math.min(parents.length, 100), timeout: '15s',
    _source: ['@id', fields.identifier, fields.name],
    // Aggregations tellen binnen de query: die moet dus ook alles vinden wat in de containers ligt.
    // De hits zelf zijn alleen de ouders (post_filter).
    query: { bool: { should: [parentClause, ...INSIDE_FIELDS.map(field => ({ terms: { [`${field}.keyword`]: list(containers) } }))], minimum_should_match: 1 } },
    post_filter: parentClause,
    // Een lege filters-aggregation weigert Elasticsearch; zonder containers (bijv. een pagina met alleen vondsten) geen telling.
    ...(containers.length ? { aggs: { inhoud: { filters: { filters: Object.fromEntries(containers.map(uri => [uri, insideClause(uri)])) }, aggs: { soort: { terms: { field: SOORT_FIELD, size: 10 } } } } } } : {})
  };
}
// Inhoud per object uit het antwoord van buildRelationQuery: Map(uri → { soort: aantal }), alleen objecten met inhoud.
export function inhoudVan(aggregations = {}) {
  const result = new Map();
  for (const [uri, bucket] of Object.entries(aggregations.inhoud?.buckets ?? {})) {
    if (!bucket.doc_count) continue;
    result.set(uri, Object.fromEntries((bucket.soort?.buckets ?? []).map(({ key, doc_count }) => [key, doc_count])));
  }
  return result;
}
// Rijksmonumenten uit erfgoed-sdo opzoeken op URI: nummer en naam.
export const erfgoedQuery = uris => ({ size: Math.min(uris.length, 100), timeout: '15s', _source: ['@id', fields.identifier, fields.name], query: { terms: { '@id.keyword': uris.length ? uris : ['-'] } } });
export const erfgoedDemoUrl = nummer => `${ERFGOED_DEMO}?${new URLSearchParams({ q: `"${nummer}"`, veld: 'Nummer', soort: 'rijksmonument' })}`;
export const lookupQuery = (soort, nummer) => ({ size: 1, query: { bool: { filter: [{ term: { [SOORT_FIELD]: soort } }, { term: { [`${fields.identifier}.keyword`]: nummer } }] } }, _source: ['@id', fields.identifier, fields.name, WKT_FIELD] });
// Export: dezelfde zoekvraag, filters en sortering, maximaal EXPORT_MAX resultaten, zonder geometrie, facets en highlights.
export function buildExportQuery(state = {}, context) {
  const { search, filters, sort, binnen } = validate({ ...state, page: 0 }, context);
  return {
    from: 0, size: EXPORT_MAX, track_total_hits: true, timeout: '20s',
    _source: ['@id', ...Object.values(fields)],
    query: { bool: { must: [search], filter: filterClauses(filters, null, binnen) } },
    ...(sorts[sort].sort ? { sort: sorts[sort].sort } : {})
  };
}
export const values = value => (Array.isArray(value) ? value : value == null ? [] : [value]).filter(value => typeof value === 'string' || typeof value === 'number').map(String);
export const textValue = value => values(value).join(', ');
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
// Openbaar of niet: alles behalve "openbaar" (en leeg) geldt als vertrouwelijk.
export const vertrouwelijk = source => values(source?.[fields.conditionsOfAccess]).some(value => value !== 'openbaar');
// Deelbare URL: ?q=…&veld=…&soort=…&periode=…&binnen=vondstlocatie:6129412&sorteer=…&pagina=…
const params = { soort: 'soort', name: 'type', keywords: 'groep', temporalCoverage: 'periode', material: 'materiaal', genre: 'stijl', category: 'waardering', addressRegion: 'provincie', addressLocality: 'plaats', conditionsOfAccess: 'toegang' };
export function toParams({ query = '', field = DEFAULT_FIELD, filters = {}, page = 0, sort = 'relevantie', jokers = false, binnen = null, jaar = null }) {
  const result = new URLSearchParams();
  if (query.trim()) result.set('q', query.trim());
  if (field !== DEFAULT_FIELD) result.set('veld', field);
  if (binnen) result.set('binnen', binnen);
  if (jaar?.van != null) result.set('van', String(jaar.van));
  if (jaar?.tot != null) result.set('tot', String(jaar.tot));
  if (jaar && jaar.modus === 'binnen') result.set('jaarmodus', 'binnen');
  for (const [key, list] of Object.entries(filters)) for (const value of list) result.append(params[key], value);
  if (sort !== 'relevantie') result.set('sorteer', sort);
  if (page > 0) result.set('pagina', String(page + 1));
  if (jokers) result.set('jokers', '1');
  return result;
}
export function fromParams(search) {
  const input = new URLSearchParams(search);
  const filters = {};
  for (const [key, name] of Object.entries(params)) {
    const list = input.getAll(name).filter(value => value && (key !== 'soort' || Object.hasOwn(soorten, value))).slice(0, MAX_VALUES);
    if (list.length) filters[key] = list;
  }
  const page = Number.parseInt(input.get('pagina') ?? '1', 10);
  const binnen = input.get('binnen');
  const getal = name => (/^-?\d{1,7}$/.test(input.get(name) ?? '') ? Number(input.get(name)) : null);
  const van = getal('van'), tot = getal('tot');
  const jaarOk = (van != null || tot != null) && geldigJaar(van) && geldigJaar(tot) && (van == null || tot == null || van <= tot);
  const state = {
    query: (input.get('q') ?? '').slice(0, 500),
    field: Object.hasOwn(searchFields, input.get('veld')) ? input.get('veld') : DEFAULT_FIELD,
    filters,
    sort: Object.hasOwn(sorts, input.get('sorteer')) ? input.get('sorteer') : 'relevantie',
    // Verborgen testschakelaar: ?jokers=1 staat een jokerteken aan het begin toe (bijv. *molen). Niet in de interface.
    jokers: input.get('jokers') === '1',
    binnen: binnen && BINNEN.test(binnen) ? binnen : null,
    jaar: jaarOk ? { van, tot, modus: input.get('jaarmodus') === 'binnen' ? 'binnen' : 'overlapt' } : null,
    page: Number.isInteger(page) && page >= 1 && page * PAGE_SIZE <= MAX_WINDOW ? page - 1 : 0
  };
  return { state, active: [...input.keys()].some(key => ['q', 'binnen', 'van', 'tot', ...Object.values(params)].includes(key)) };
}
// Uitleg van de zoekactie in gewone taal. binnenLabel is bijv. 'vondstlocatie “Kletterstraat” (6129412)'.
const fieldText = { Alles: 'in alle tekstvelden', Omschrijving: 'in de omschrijving', Naam: 'in de naam of het type', Plaats: 'in de plaatsnaam', Periode: 'in de periode', Materiaal: 'in het materiaal', Nummer: 'in het nummer (CHOI of Archis)', Exact: 'exact (zonder meervoud, samenstellingen en synoniemen)' };
const filterValue = (key, value) => `“${key === 'soort' ? soorten[value] ?? value : value}”`;
export function describe(state = {}, binnenLabel) {
  const { query = '', field = DEFAULT_FIELD, filters = {}, page = 0, sort = 'relevantie', jokers = false, binnen = null, jaar = null } = state;
  const lines = [];
  const trimmed = query.trim();
  if (!trimmed) lines.push(binnen ? 'Toont alles (geen zoekvraag).' : 'Toont alle objecten (geen zoekvraag).');
  else {
    const readable = trimmed.split(/("[^"]*"(?:~\d+)?)/).map((part, index) => index % 2 ? part : part.replace(/\bAND\b|&&/g, 'én').replace(/\bOR\b|\|\|/g, 'of').replace(/\bNOT\b/g, 'niet')).join('');
    lines.push(`Zoekt ${fieldText[field]} naar: ${readable}`);
    const words = trimmed.replace(/"[^"]*"(~\d+)?/g, ' x ').replace(/[()]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length > 1 && !words.some(word => /^(AND|OR|NOT|&&|\|\|)$/.test(word) || /^[+-]/.test(word))) lines.push('Zonder AND/OR/NOT is het genoeg als één van de woorden voorkomt.');
  }
  if (binnen) lines.push(binnen.startsWith('rond:') ? `Alleen wat binnen ${binnenLabel ?? binnen} ligt.` : `Alleen wat ligt in ${binnenLabel ?? binnen}.`);
  if (jaar) lines.push(`Alleen objecten waarvan de datering ${JAARMODI[jaar.modus ?? 'overlapt']} valt in ${jaarBereik(jaar)} (jaartallen uit ABR).`);
  if (verbergt({ filters, binnen })) lines.push('Vondsten en grondsporen worden niet getoond; vink ze aan bij Soort om ze mee te nemen.');
  const active = Object.entries(filters).filter(([, list]) => list.length);
  if (active.length) lines.push(`Alleen objecten met ${active.map(([key, list]) => `${facets[key].toLowerCase()} ${list.map(value => filterValue(key, value)).join(' of ')}`).join(', en ')}.`);
  if (jokers) lines.push('Testmodus: een jokerteken aan het begin (bijv. *pot) is toegestaan.');
  if (trimmed && sort === 'relevantie' && (field === 'Alles' || field === 'Exact')) lines.push(`Volgorde: een treffer in de naam of het type telt ${WEIGHT}× zo zwaar als een treffer in een ander veld. Dat verandert alleen de volgorde, niet het aantal.`);
  lines.push(`Gesorteerd op ${sort === 'relevantie' ? 'relevantie (best passend eerst)' : sorts[sort].label.charAt(0).toLowerCase() + sorts[sort].label.slice(1)}; resultaten ${page * PAGE_SIZE + 1} tot ${(page + 1) * PAGE_SIZE}.`);
  return lines;
}
// CSV met puntkomma (opent direct goed in Nederlandse Excel) en BOM voor UTF-8.
export function toCsv(hits, decode = text => text) {
  const columns = [['Soort', 'soort'], ['Nummer (CHOI)', 'identifier'], ['Archis-nummer', 'alternateName'], ['Naam of type', 'name'], ['Periode', 'temporalCoverage'], ['Beginjaar', 'startDate'], ['Eindjaar', 'endDate'], ['Materiaal', 'material'], ['Stijl en cultuur', 'genre'], ['Aantal', 'materialExtent'], ['Toestand', 'itemCondition'], ['Waardering', 'category'], ['Plaats', 'addressLocality'], ['Provincie', 'addressRegion'], ['Toegang', 'conditionsOfAccess'], ['Ligt in', 'ligtIn'], ['Onderzoeksgebied', 'isPartOf'], ['Linked Data', '@id'], ['ABR-begrip', 'sameAs'], ['Typegroep (ABR)', 'keywords'], ['Omschrijving', 'description']];
  const cell = text => {
    const value = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text; // voorkom formule-injectie in spreadsheets
    return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };
  const get = (source, key) => {
    if (key === 'soort') return [soorten[soortVan(source['@id'])] ?? ''];
    if (key === 'ligtIn') return PARENT_FIELDS.flatMap(field => values(source[field]));
    return values(source[key === '@id' ? '@id' : fields[key]]);
  };
  const rows = hits.map(hit => columns.map(([, key]) => cell(decode(get(hit._source ?? {}, key).join(' | ')))).join(';'));
  return `﻿${columns.map(([label]) => label).join(';')}\r\n${rows.join('\r\n')}\r\n`;
}
export async function search(body, signal, url = endpoint()) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal, credentials: 'omit' });
  if (!response.ok) {
    const detail = await response.text();
    console.error('Elasticsearch', response.status, detail);
    if (response.status === 404) throw new Error(`De zoekservice “${service}” bestaat (nog) niet.`);
    if (response.status === 400 && /parsing_exception|parse_exception|query_shard_exception/.test(detail)) throw new Error('Controleer je zoeksyntax: gebruik bijvoorbeeld aardewerk AND Romeins en sluit quotes en haakjes.');
    if (response.status === 400 && /aggregat|fielddata/.test(detail)) throw new Error('De facetquery werkt niet. Probeer het later opnieuw.');
    throw new Error('De zoekservice kan je vraag nu niet verwerken. Probeer het opnieuw.');
  }
  const result = await response.json();
  if (result.timed_out || result._shards?.failed) throw new Error('De zoekservice gaf een onvolledig antwoord. Verfijn je zoekvraag en probeer opnieuw.');
  if (!result.hits || (body.aggs && !result.aggregations)) throw new Error('De zoekservice gaf geen volledige resultaten en facetten terug.');
  return result;
}
