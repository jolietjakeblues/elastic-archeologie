// Test tegen de echte service. Andere service: node tests/live.mjs <naam>
import assert from 'node:assert/strict';
import { buildQuery, buildRelationQuery, inhoudVan, lookupQuery, insideClause, nearClause, bucketsOf, search, setService, endpoint, soorten, BASE, fields } from '../web/search.js';
import { geometryFor } from '../web/geo.js';
setService(process.argv[2]);
const timeout = () => AbortSignal.timeout(30000);
const preflight = await fetch(endpoint(), { method: 'OPTIONS', headers: { Origin: 'http://127.0.0.1:4175', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } });
assert.ok(preflight.ok, `CORS-preflight naar ${endpoint()}`);
const buckets = (data, key) => bucketsOf(data.aggregations[key]).buckets;
// Alle soorten: de soortfacet telt op tot het totaal, en er zijn geen documenten met # in de URI.
const all = await search({ ...buildQuery({ filters: { soort: Object.keys(soorten) } }), aggs: { ...buildQuery({}).aggs, hekje: { filter: { wildcard: { '@id.keyword': '*#*' } } } } }, timeout());
const perSoort = Object.fromEntries(buckets(all, 'soort').map(bucket => [bucket.key, bucket.doc_count]));
assert.equal(Object.values(perSoort).reduce((a, b) => a + b, 0), all.hits.total.value, 'soortfacet = totaal (geen onbekende soorten)');
assert.equal(all.aggregations.hekje.doc_count, 0, 'geen hulpknopen (#…) als document');
// Standaard: zonder vondsten en grondsporen.
const standaard = await search(buildQuery({}), timeout());
assert.equal(standaard.hits.total.value, all.hits.total.value - (perSoort.vondsten ?? 0) - (perSoort.grondsporen ?? 0));
// Opzoeken op CHOI en binnen een vondstlocatie.
const vl = (await search(lookupQuery('vondstlocatie', '6129412'), timeout())).hits.hits[0]?._source;
assert.ok(vl, 'vondstlocatie 6129412 (Kletterstraat)');
const binnen = await search(buildQuery({ binnen: 'vondstlocatie:6129412' }, { clause: insideClause(vl['@id']) }), timeout());
const binnenSoort = Object.fromEntries(buckets(binnen, 'soort').map(bucket => [bucket.key, bucket.doc_count]));
assert.ok(binnenSoort.vondsten > 0 && binnenSoort.grondsporen > 0 && binnenSoort.archeologischcomplex > 0, 'vondsten, sporen en complexen in de vondstlocatie');
// Relaties: inhoud per object.
const relaties = await search(buildRelationQuery([], [vl['@id']]), timeout());
assert.deepEqual(inhoudVan(relaties.aggregations).get(vl['@id']), binnenSoort);
// In de buurt.
const og = (await search(lookupQuery('archeologischonderzoeksgebied', '2041587'), timeout())).hits.hits[0]._source;
const near = await search(buildQuery({ binnen: 'rond:archeologischonderzoeksgebied:2041587:1000' }, { clause: nearClause(geometryFor(og).point, 1000, og['@id']) }), timeout());
assert.ok(near.hits.hits.every(hit => hit._id !== og['@id']));
// Sorteren op nummer als getal.
const laagste = await search(buildQuery({ filters: { soort: ['archeologischterrein'] }, sort: 'nummer' }), timeout());
const nummers = laagste.hits.hits.map(hit => Number(hit._source[fields.identifier][0]));
assert.deepEqual(nummers, [...nummers].sort((a, b) => a - b));
console.log(JSON.stringify({ service: endpoint(), totaal: all.hits.total.value, perSoort, standaard: standaard.hits.total.value, inVondstlocatie6129412: binnenSoort, binnen1kmVanOnderzoeksgebied: near.hits.total.value, uri: `${BASE}vondstlocatie/6129412` }, null, 2));
