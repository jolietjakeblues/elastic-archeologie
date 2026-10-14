import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queryFields, WEIGHT, buildQuery, buildExportQuery, buildRelationQuery, inhoudVan, bucketsOf, insideClause, nearClause, BINNEN, PARENT_FIELDS, INSIDE_FIELDS, STANDAARD_SOORTEN, erfgoedQuery, erfgoedDemoUrl, fields, safeUrl, soortVan, vertrouwelijk, toParams, fromParams, describe, toCsv, BASE, EXPORT_MAX, setService, endpoint, DEFAULT_SERVICE } from '../web/search.js';
const periode = `${fields.temporalCoverage}.keyword`, materiaal = `${fields.material}.keyword`;
const standaard = { terms: { '@id.soort': STANDAARD_SOORTEN } };
test('Zoeken (query) en filteren (post_filter) blijven gescheiden; facets tellen zonder hun eigen filter', () => {
  const body = buildQuery({ query: 'aardewerk AND Romeins', filters: { soort: ['vondsten'], temporalCoverage: ['Romeinse Tijd'], material: 'keramiek' }, page: 1 });
  assert.equal(body.query.query_string.query, 'aardewerk AND Romeins');
  assert.deepEqual(body.post_filter.bool.filter, [{ terms: { '@id.soort': ['vondsten'] } }, { terms: { [periode]: ['Romeinse Tijd'] } }, { terms: { [materiaal]: ['keramiek'] } }]);
  assert.deepEqual(body.aggs.temporalCoverage.filter.bool.filter, [{ terms: { '@id.soort': ['vondsten'] } }, { terms: { [materiaal]: ['keramiek'] } }]);
  assert.equal(body.from, 25); assert.equal(body.size, 25); assert.equal(body.track_total_hits, true);
  assert.ok(buildQuery({ sort: 'periode' }).sort[0][periode]);
});
test('Standaard zonder vondsten en grondsporen, behalve met soortfilter of binnen een object', () => {
  const body = buildQuery({});
  assert.deepEqual(body.post_filter.bool.filter, [standaard]);
  assert.deepEqual(body.aggs.soort.filter.bool.filter, [], 'de soortfacet telt alle soorten');
  assert.deepEqual(body.aggs.material.filter.bool.filter, [standaard], 'andere facetten volgen de standaard');
  assert.ok(!STANDAARD_SOORTEN.includes('vondsten') && !STANDAARD_SOORTEN.includes('grondsporen'));
  assert.deepEqual(buildQuery({ filters: { soort: ['vondsten'] } }).post_filter.bool.filter, [{ terms: { '@id.soort': ['vondsten'] } }]);
  const binnen = buildQuery({ binnen: 'vondstlocatie:6129412' }, { clause: insideClause(`${BASE}vondstlocatie/6129412`) });
  assert.deepEqual(binnen.post_filter.bool.filter, []);
  assert.match(describe({}).join(' '), /Vondsten en grondsporen worden niet getoond/);
  assert.doesNotMatch(describe({ filters: { soort: ['vondsten'] } }).join(' '), /niet getoond/);
});
test('Soort: filter, facet en URI', () => {
  assert.deepEqual(buildQuery({}).aggs.soort.aggs.values, { terms: { field: '@id.soort', size: 20 } });
  assert.throws(() => buildQuery({ filters: { soort: ['rijksmonument'] } }));
  assert.equal(soortVan(`${BASE}archeologischonderzoeksgebied/2041587`), 'archeologischonderzoeksgebied');
  assert.equal(soortVan(`${BASE}vondsten/2182322`), 'vondsten');
  assert.equal(soortVan('https://example.org/x'), null);
  assert.deepEqual(bucketsOf({ values: { buckets: [{ key: 'vondsten', doc_count: 3 }] } }).buckets, [{ key: 'vondsten', doc_count: 3 }]);
});
test('Binnen een object: via de drie relatievelden; in de buurt via geo_distance', async () => {
  const { WKT_FIELD } = await import('../web/geo.js');
  const uri = `${BASE}vondstlocatie/6129412`;
  assert.deepEqual(insideClause(uri).bool.should, INSIDE_FIELDS.map(field => ({ term: { [`${field}.keyword`]: uri } })));
  assert.deepEqual(INSIDE_FIELDS, [...PARENT_FIELDS, fields.isPartOf], 'alle niveaus via isPartOf (onderzoeksgebied)');
  assert.deepEqual(nearClause({ lat: 52, lon: 5 }, 500, uri).bool.filter[0], { geo_distance: { distance: '500m', [WKT_FIELD]: { lat: 52, lon: 5 } } });
  assert.ok(BINNEN.test('vondstlocatie:6129412'));
  assert.ok(BINNEN.test('archeologischonderzoeksgebied:2041587'));
  assert.ok(BINNEN.test('rond:archeologischterrein:6049046:1000'));
  assert.ok(!BINNEN.test('vondsten:1'), 'in een vondst ligt niets');
  assert.ok(!BINNEN.test('rond:vondsten:1:500'), 'een vondst heeft geen locatie');
  assert.ok(!BINNEN.test('rond:vondstlocatie:1:300'));
  assert.throws(() => buildQuery({ binnen: 'vondstlocatie:1' }), /Onbekend gebied/);
  const body = buildQuery({ query: 'pot', binnen: 'vondstlocatie:6129412' }, { clause: insideClause(uri) });
  assert.deepEqual(body.query.bool.filter, [insideClause(uri)]);
});
test('Relaties: ouders op URI, inhoud per object en soort in één request; rijksmonumenten via erfgoed-sdo', () => {
  const vl = `${BASE}vondstlocatie/1`, og = `${BASE}archeologischonderzoeksgebied/2`;
  const body = buildRelationQuery([og], [vl, og]);
  assert.deepEqual(body.post_filter, { terms: { '@id.keyword': [og] } });
  assert.deepEqual(body.query.bool.should[0], body.post_filter);
  assert.deepEqual(body.query.bool.should.slice(1), INSIDE_FIELDS.map(field => ({ terms: { [`${field}.keyword`]: [vl, og] } })), 'de aggregation moet ook de inhoud zien');
  assert.deepEqual(body.aggs.inhoud.filters.filters[og], insideClause(og), 'zelfde clause als Toon wat erin ligt: een object telt één keer');
  assert.deepEqual(buildRelationQuery([], []).post_filter.terms['@id.keyword'], ['-']);
  const inhoud = inhoudVan({ inhoud: { buckets: {
    [vl]: { doc_count: 8, soort: { buckets: [{ key: 'archeologischcomplex', doc_count: 2 }, { key: 'grondsporen', doc_count: 1 }, { key: 'vondsten', doc_count: 5 }] } },
    [og]: { doc_count: 0, soort: { buckets: [] } }
  } } });
  assert.deepEqual(inhoud.get(vl), { archeologischcomplex: 2, grondsporen: 1, vondsten: 5 });
  assert.equal(inhoud.has(og), false);
  const monument = `${BASE}rijksmonument/45708`;
  assert.deepEqual(erfgoedQuery([monument]).query, { terms: { '@id.keyword': [monument] } });
  assert.equal(erfgoedDemoUrl('532442'), 'https://erfgoed-sdo-elastic-demo.jolietjakeblues64.workers.dev/?q=%22532442%22&veld=Nummer&soort=rijksmonument');
});
test('Veldkeuze, filters, sortering, querylengte en resultaatvenster zijn begrensd', () => {
  assert.throws(() => buildQuery({ field: 'arbitrary' }));
  assert.throws(() => buildQuery({ filters: { arbitrary: ['value'] } }));
  assert.throws(() => buildQuery({ filters: { material: Array.from({ length: 21 }, (_, i) => `m${i}`) } }));
  assert.throws(() => buildQuery({ sort: 'script' }));
  assert.throws(() => buildQuery({ page: -1 }));
  assert.throws(() => buildQuery({ page: 400 }));
  assert.throws(() => buildQuery({ query: 'a'.repeat(501) }));
  assert.deepEqual(buildQuery().query, { match_all: {} });
  const exported = buildExportQuery({ query: 'pot', filters: { soort: ['vondsten'] }, page: 7 });
  assert.equal(exported.size, EXPORT_MAX); assert.equal(exported.from, 0); assert.equal(exported.aggs, undefined);
  assert.deepEqual(exported.query.bool.filter, [{ terms: { '@id.soort': ['vondsten'] } }]);
  assert.deepEqual(buildExportQuery({}).query.bool.filter, [standaard]);
});
test('Weging: alleen de naam telt zwaarder, alleen in Alles en Exact', () => {
  const body = buildQuery({ query: 'aardewerk' });
  assert.ok(body.query.query_string.fields.includes(`${fields.name}^${WEIGHT}`));
  assert.ok(body.query.query_string.fields.includes(fields.material));
  assert.ok(Object.keys(body.highlight.fields).every(key => !key.includes('^')));
  assert.ok(queryFields('Exact').includes(`${fields.name}.exact^${WEIGHT}`));
  assert.deepEqual(queryFields('Nummer'), [fields.identifier, fields.alternateName]);
});
test('Deelbare URL: heen en terug, onbekende waarden worden genegeerd', () => {
  const state = { query: 'aardewerk', field: 'Naam', filters: { soort: ['vondsten'], temporalCoverage: ['Romeinse Tijd'] }, page: 2, sort: 'naam', jokers: false, binnen: 'vondstlocatie:6129412' };
  const search = toParams(state).toString();
  assert.equal(search, 'q=aardewerk&veld=Naam&binnen=vondstlocatie%3A6129412&soort=vondsten&periode=Romeinse+Tijd&sorteer=naam&pagina=3');
  assert.deepEqual(fromParams(`?${search}`), { state, active: true });
  const bad = fromParams('?veld=__proto__&sorteer=x&pagina=-4&onbekend=1&binnen=gezicht:1&soort=rijksmonument');
  assert.deepEqual(bad.state, { query: '', field: 'Alles', filters: {}, sort: 'relevantie', page: 0, jokers: false, binnen: null });
  assert.equal(toParams({}).toString(), '');
});
test('Service: standaard of een veilige naam via ?service=', () => {
  assert.equal(setService('archeologie-sdo-elas'), 'archeologie-sdo-elas');
  assert.match(endpoint(), /\/rce\/archeologie-sdo\/services\/archeologie-sdo-elas\/_search$/);
  assert.equal(setService('../../erfgoed-sdo'), DEFAULT_SERVICE);
  assert.equal(setService(null), DEFAULT_SERVICE);
});
test('CSV en toegang', () => {
  const source = { '@id': `${BASE}vondsten/1`, [fields.identifier]: ['1'], [fields.alternateName]: ['vondstnummer 9'], [fields.name]: ['=SOM(A1)'], [fields.spatialCoverage]: [`${BASE}vondstlocatie/2`], [fields.description]: ['regel 1\nmet "quote"; en meer'] };
  const csv = toCsv([{ _source: source }]);
  const [header, row] = csv.slice(1).split('\r\n');
  assert.equal(header.split(';').length, 17);
  assert.match(row, /^Vondst;1;vondstnummer 9;'=SOM\(A1\);/);
  assert.ok(row.includes(`${BASE}vondstlocatie/2`));
  assert.match(csv, /"regel 1\nmet ""quote""; en meer"/);
  assert.equal(vertrouwelijk({ [fields.conditionsOfAccess]: ['openbaar'] }), false);
  assert.equal(vertrouwelijk({ [fields.conditionsOfAccess]: ['vertrouwelijk'] }), true);
  assert.equal(vertrouwelijk({}), false);
  assert.equal(safeUrl('javascript:alert(1)'), null);
});
