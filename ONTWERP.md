# Ontwerp opleverinspectie 2

Waarom versie 2 anders is gebouwd dan versie 1, en wat er nog openstaat. Kort per probleem uit de review van versie 1.7.0: wat er misging en hoe het nu is opgelost.

## 1. Domeinmodel volgt het opleverprotocol

| Versie 1 | Versie 2 |
|---|---|
| "Oplevering starten" kopieerde alle vooropnamepunten (`bronId`); foto's werden met een referentietelling gedeeld | Eén punt = één record. Fases voegen alleen gebeurtenissen toe aan de `historie` van het punt |
| Puntnummer = plek in de lijst; hernummerde bij "hersteld" | Vast nummer per object (`puntTeller`), nooit hergebruikt. Kenmerk `complex-blok-object-nr` in exports |
| Geen herstelfase; paraaf bij de oplevering; herstel alleen via "heropenen" (handtekeningen weg) | Fase **herstel** met termijn (werkdagen) en rondes. "Hersteld" in de herstelcontrole is de paraaf van de opdrachtgever |
| Alleen A blokkeerde; B mocht open bij tekenen | Per urgentieklasse instelbaar `blokkeertOplevering`; standaard A en B (protocol: B herstellen vóór de formele oplevering) |
| "Niet erkend" was een vinkje | Niet erkend met reden en tijd, gelogd in de historie |

Fases: `voor → oplever → herstel (rondes) → gereed`. De regels staan als pure functies in `js/model.js`, met unit-tests in `tests/model.test.js`.

## 2. Ondertekenen = bevriezen

| Versie 1 | Versie 2 |
|---|---|
| De PDF werd bij elke download opnieuw gemaakt uit actuele gegevens en actuele code | De PDF wordt bij ondertekenen één keer gemaakt en opgeslagen (`documenten` + `bestanden`) |
| Handtekening = losse PNG, niet aan de inhoud gebonden | Inhoudskenmerk = SHA-256 over de canonieke inhoud, inclusief een hash van elke foto en handtekening; SHA-256 van het PDF-bestand apart; echtheidscontrole in de app |
| Verzamelafronding kopieerde één handtekening onder tientallen losse PV's | Eén verzamel-PV met per object de volledige inhoud; dat ene document wordt getekend |
| Heropenen bevroor een kopie van het hele object | Herziening = nieuw document met `vervangt`; het oude blijft ongewijzigd. Bij een verzamel-PV geldt de vervanging alleen voor dat ene object |

Een document wordt met `add` geschreven: een bestaand document overschrijven geeft een fout.

## 3. Opslag en samenwerken

| Versie 1 | Versie 2 |
|---|---|
| Hele dataset als één IndexedDB-record, bij elke toetsaanslag herschreven | Eén record per complex, blok, object, punt en document; typen wordt per record gebundeld (400 ms) |
| Samenvoegen van back-ups per heel object, op adres-tekst; werk van een tweede inspecteur verdween stil | Samenvoegen per record op `gewijzigd`/`rev`; verwijderen laat een grafsteen achter |
| Noodkopie in localStorage ging bij opstart vóór IndexedDB | Eén bron: IndexedDB. Bij verlaten van de pagina wordt de wachtrij direct weggeschreven |
| Tweede tabblad: alleen een waarschuwing | Web Locks: een tweede tabblad kan niet schrijven |
| Back-up herinnering alleen als tekst | Teller "wijzigingen sinds back-up" en een melding na 20 uur; melding "zet op beginscherm" op iOS |

## 4. Configuratie in plaats van code

Opdrachtgever, urgentieklassen, limieten, termijn, verklaringsteksten, ruimtes, snelkeuzes, objecttypen, meters en overige zaken staan in `js/config.js` als standaard en zijn in de app aan te passen. Daarmee is de app herbruikbaar voor andere opdrachtgevers (AIM-platform).

## 5. Code

- Geen monoliet van 1,27 MB meer: ES-modules per verantwoordelijkheid, bibliotheken en lettertypen als losse bestanden die pas worden geladen als ze nodig zijn.
- Geen `innerHTML` met tekst van de gebruiker: elementen worden gebouwd met `h()`.
- PDF via AutoTable in plaats van coördinaten per regel; foto's worden één voor één verkleind ingevoegd.
- Service worker met één versie-cache: alle bestanden passen altijd bij elkaar; een nieuwe versie wordt pas na een tik actief.

## 6. Bewerkingsflow op de bouwplaats

- **Foto eerst**: *Punt met foto* opent direct de camera; daarna één scherm met ruimte (knoppen in looproute), omschrijving (snelkeuzes, dicteren via het toetsenbord), urgentie en niet erkend. *Opslaan + volgende foto* houdt de ruimte vast.
- Punten gegroepeerd per ruimte; te beoordelen punten met twee grote knoppen direct op de kaart.
- Actiebalk onderin met de volgende stap van de fase.
- Complexoverzicht als matrix per blok, met fase-kleur, open A/B en verlopen termijn.

## 7. Versie 2.1: de schermen van versie 1

Versie 2.0 had een nieuwe bediening (fasebalk, actiebalk onderin, punten als losse kaarten met een invulscherm). In 2.1 zijn de schermen weer die van versie 1, terwijl alles onder de schermen van versie 2 blijft.

| Gelijk aan versie 1 | Onder de motorkap (versie 2) |
|---|---|
| Kop met logo en één menu ☰; kruimelpad als titel | Routering via de hash; terug en terugvegen werken vanzelf |
| Objectscherm met tabbladen en schuivende tabknop; schuif-fade bij wisselen | Wisselen van tabblad vervangt de plek in de geschiedenis, zoals in versie 1 |
| Puntkaarten die je direct invult: ruimte, omschrijving, A/B/C, foto | Elke wijziging via `wijzigPuntSamengevoegd` (model.js): typen geeft één historieregel per veld en fase, niet één per toets |
| Ondertekenen op het tabblad Afronden, twee handtekeningvakken | `onderteken()` maakt het PV één keer en bevriest het, met inhoudskenmerk |
| *Afronding heropenen…* met reden; *Eerdere versies* | `startHerziening()`; het oude document blijft ongewijzigd en wordt gemarkeerd als vervangen |
| Blok/Complex afronden met groepen, Alles/Niets, één keer tekenen | `ondertekenVerzamel()`: één verzamel-PV met de volledige inhoud per object |
| Complex instellingen met standaardgegevens en waarschuwing C-punten | De C-limiet staat in de configuratie en geldt voor alle complexen |

Wat versie 1 niet had, staat in dezelfde vormgeving erbij: het tabblad **Herstel**, het tabblad **Documenten**, het documentscherm met echtheidscontrole en **Instellingen** (menu ☰ op het complexoverzicht).

Wat bewust anders is dan versie 1: punten worden niet hernummerd; *Paraaf* hoort bij de herstelcontrole en niet bij de oplevering; *Niet erkend* vraagt om een reden; een punt dat in een vastgelegd document staat kan niet worden verwijderd, alleen *laten vervallen* met een reden; *Oplevering ongedaan maken* bestaat niet meer, omdat de vooropname bij het starten wordt vastgelegd.

De schermen staan in `scherm-overzicht.js` (complexen, complex, blok), `scherm-object.js` (tabbladen, gegevens, meterstanden, overige zaken), `scherm-punten.js` (vooropname, oplevering, herstel), `scherm-afronden.js` (afronden, documenten, exporteren), `scherm-tekenen.js` (blok/complex afronden) en `scherm-overig.js` (instellingen, document). De opmaak in `css/app.css` is die van versie 1, aangevuld voor de nieuwe onderdelen.

## Nog niet gebouwd

1. **Server als bron van waarheid.** Het opslagmodel is erop voorbereid: elk record heeft `id`, `gewijzigd`, `rev` en eventueel `verwijderd`, en documenten zijn onveranderlijk. Synchroniseren kan dus per record (bijvoorbeeld Cloudflare D1 voor de gegevens en R2 voor de foto's en PDF's). Foto's zouden dan direct na het maken in een uploadwachtrij gaan, en de handmatige back-up vervalt.
2. **Rollen**: de opdrachtnemer met een eigen link (herstel melden met foto, niet erkennen met reden) en asset management met een overzicht over complexen heen. Daar is de server voor nodig.
3. **Gezamenlijk ondertekenen van een herstelcontrole** (nu alleen per object).
4. **Feestdagen** in de hersteltermijn.
5. **Inlezen van back-ups van versie 1** (alleen nodig als er echte gegevens in versie 1 staan).
