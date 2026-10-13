# Archeologie SDO/Elastic demo

> **Dit is een demo.** Bouw hier geen applicaties of andere afhankelijkheden op. De scripts, index en service kunnen zonder aankondiging wijzigen of verdwijnen.

Een webdemo die laat zien wat Elasticsearch bovenop de SDO/Linked Data-publicatie van de RCE-dataset [`archeologie-sdo`](https://linkeddata.cultureelerfgoed.nl/rce/archeologie-sdo) mogelijk maakt. In één index staan archeologische onderzoeksgebieden, vondstlocaties, terreinen, complexen, grondsporen en vondsten. De demo kan fulltext en Booleaans zoeken, facetten tonen (soort, periode, materiaal, stijl, waardering, plaats), relaties volgen (wat ligt waarin), en zoeken in de buurt van een object. Er is een kaart en elk resultaat linkt naar Linked Data.

Zusterdemo van de [Erfgoed SDO/Elastic demo](https://github.com/jolietjakeblues/elastic-erfgoed---geo) (rijksmonumenten, complexen, gezichten, werelderfgoed). Zoeksyntax, facetlogica, deelbare URL, CSV-export, kaart en huisstijl werken hetzelfde.

## Data

De dataset wordt gevuld met CONSTRUCT-queries op het RCE CHO-endpoint, als job in TriplyDB. De queries staan in [`archeologie/`](archeologie/):

| Query | Soort (URI) | Aantal | schema.org | Geometrie | Ligt in |
|---|---|---:|---|---|---|
| `0-archeologische-terreinen.rq` | `archeologischterrein` | 13.025 | `Place` | vlak van het rijksmonument (1.812) | rijksmonument (erfgoed-sdo) |
| `1-onderzoeksgebieden.rq` | `archeologischonderzoeksgebied` | 113.434 | `Place` | eigen vlak | – |
| `2-vondstlocaties.rq` | `vondstlocatie` | 111.854 | `Place` | vlak van het onderzoeksgebied (ca. 40.000) | onderzoeksgebied |
| `3-archeologische-complexen.rq` | `archeologischcomplex` | 360.375 | `Place` | – | vondstlocatie, terrein of onderzoeksgebied |
| `4-grondsporen.rq` | `grondsporen` | 92.613 | `CreativeWork` | – | vondstlocatie (`locationCreated`) |
| `5-vondsten.rq` | `vondsten` | 446.665 | `CreativeWork` | – | vondstlocatie (`spatialCoverage`) |

Afspraken in de queries:

- **Plat.** Alleen het object zelf is subject. Elk subject wordt in Elasticsearch een eigen document; hulpknopen (bijv. `schema:PropertyValue` met een `#…`-URI) zouden als extra "objecten" in de index en de soortfacet verschijnen.
- **Nummer** (`schema:identifier`) is de CHOI, gelijk aan het getal aan het eind van de URI. Archis-nummers staan als tekst in `schema:alternateName` ("vondstnummer 25404", "waarnemingsnummer 2963").
- **Type** van complexen, grondsporen en vondsten: concept-URI in `schema:additionalType`, label in `schema:name`. Sommige concepten hebben twee labels (bijv. "aardewerk, handgevormd" en "Aardewerk, handgevormd:onbepaald"); dan zijn er twee namen.
- **Periode** in `schema:temporalCoverage` als tekst ("Romeinse Tijd - Nieuwe Tijd Laat"). Er zijn geen jaartallen.
- **Overig**: materiaal (`material`), stijl en cultuur (`genre`), aantal (`materialExtent`), toestand (`itemCondition`), waardering van een terrein (`category`), wijze van verwerving en AMK-indicatie (`keywords`), vertrouwelijkheid (`conditionsOfAccess`; bij complexen, sporen en vondsten overgenomen van het object waarin ze liggen).
- `formeelStandpunt` staat bij de archeologische omschrijvingen meestal op `false`; er wordt daarom niet op gefilterd.
- Labels van gemeente en provincie worden met hun pad in één `OPTIONAL` opgehaald. Los van elkaar matcht een lege variabele met alle labels in `graph:owms` (time-out).

**Testopzet:** vertrouwelijke objecten zitten erin, met geometrie (1.902 onderzoeksgebieden, 19 vondstlocaties). Houd de dataset intern zolang dat zo is.

## Service

```text
POST https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/archeologie-sdo/services/Archeologie-sdo-nl/_search
```

De service wordt gemaakt met de index template [`triply/elastic-service-archeologie.json`](triply/elastic-service-archeologie.json): dezelfde als `Erfgoed-sdo-nl3` (Nederlandse taalverwerking, `@id.soort` uit de URI, `geo:asWKT` als `geo_shape`, `identifier.getal` als `long`), plus `materialExtent.getal`. Aanmaken met een token met *Management access*, in PowerShell:

```bash
curl.exe -H "Authorization: Bearer $env:TRIPLY_TOKEN" -H "Content-Type: application/json" -X POST "https://api.linkeddata.cultureelerfgoed.nl/datasets/rce/archeologie-sdo/services" -d "@triply/elastic-service-archeologie.json"
```

Templates worden alleen bij het aanmaken gelezen; een wijziging betekent de service opnieuw aanmaken. Een andere service proberen kan met `?service=<naam>` in de URL van de demo (alleen services van `rce/archeologie-sdo`).

## Wat de demo doet

- **Standaard zonder vondsten en grondsporen.** Samen ca. 540.000 van de 1,1 miljoen objecten; anders bepalen ze elk resultaat. Zonder soortfilter en zonder gekozen object staat in `post_filter` een `terms` op `@id.soort` met de andere vier soorten. De soortfacet telt zonder dat filter.
- **Ligt in** bij elk resultaat: het object uit `containedInPlace`, `locationCreated` of `spatialCoverage`. Een rijksmonument staat in `erfgoed-sdo` en krijgt alleen een Linked Data-link.
- **Bevat** bij een onderzoeksgebied, vondstlocatie of terrein: hoeveel objecten erin liggen, per soort, met **Toon wat erin ligt** (`binnen=vondstlocatie:6129412`). Dat is één extra request voor de hele pagina: een `terms`-aggregation op de drie relatievelden, beperkt tot de URI's op de pagina.
- **In de buurt** (`binnen=rond:archeologischonderzoeksgebied:2041587:1000`): `geo_distance` vanaf het (zwaarte)punt, voor objecten met een geometrie.
- Facetten: soort, naam of type, periode, materiaal, stijl en cultuur, waardering, provincie, plaats, toegang. Sorteren op relevantie (naam telt 3×), naam, plaats, periode, soort of nummer.

## Lokaal starten

Vereist Node.js 18 of nieuwer, zonder npm-dependencies.

```bash
npm start
```

Open daarna `http://127.0.0.1:4175`.

```bash
npm test
```

```bash
npm run test:live
```

`npm test` test queryopbouw, standaardfilter, relaties, URL, uitleg en CSV zonder netwerk. `npm run test:live` test tegen de service: CORS, soortfacet = totaal, geen `#…`-documenten, de standaard zonder vondsten en grondsporen, binnen vondstlocatie 6129412, de inhoudtelling, in de buurt en sorteren op nummer. Andere service: `node tests/live.mjs <naam>`.

## Deployment

Een Cloudflare Worker die alleen de statische bestanden uit `web/` serveert (`wrangler.jsonc`, naam `elastic-archeologie`), online op <https://elastic-archeologie.jolietjakeblues64.workers.dev/>. De repository is gekoppeld via Workers Builds: elke push naar `main` wordt automatisch gepubliceerd, andere branches krijgen een preview-URL. Handmatig:

```bash
npx wrangler deploy
```

## Bestanden

| Bestand | Rol |
|---|---|
| `archeologie/*.rq` | CONSTRUCT-queries voor de dataset |
| `triply/elastic-service-archeologie.json` | Config van de Elasticsearch-service |
| `web/search.js` | Velden, soorten, standaardfilter, queryopbouw (zoeken, context, facetten, relaties), URL, uitleg, CSV, service |
| `web/app.js` | Interface: resultaten met relaties, facetten, context, kaart, export |
| `web/geo.js` | WKT naar kaartcoördinaten (gelijk aan de erfgoeddemo) |
| `web/style.css` | RCE-huisstijl, kleuren per soort |
| `tests/search.test.mjs`, `tests/live.mjs` | Tests zonder en met netwerk |

## Bekende beperkingen

- Complexen, grondsporen en vondsten hebben geen locatie; vondstlocaties en terreinen alleen een geleend vlak. Dat vlak is het hele onderzoeksgebied of rijksmonument, niet de vindplek.
- **Toon wat erin ligt** gaat één niveau diep: in een onderzoeksgebied zie je de vondstlocaties, niet de vondsten daarin.
- Facetten tonen de 100 meest voorkomende waarden.
- De kaart toont alleen de resultaten van de huidige pagina (25).
