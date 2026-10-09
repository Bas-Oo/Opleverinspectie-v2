# Opleverinspectie 2 — Woningstichting Wageningen

Webapp om bij de oplevering van nieuwbouw per woning en algemene ruimte de tekortkomingen vast te leggen, met foto, op de iPad. Werkt offline; alle gegevens staan op het apparaat. Versie **2.1.0**: de schermen en de bediening van versie 1, op de techniek van versie 2 (zie `ONTWERP.md`).

## Uitrollen naast versie 1

Versie 2 heeft een eigen opslag (IndexedDB `opleverinspectie-v2`) en een eigen cache (`oi2-app-…`) en raakt de gegevens van versie 1 niet. Zet versie 2 wel op een **eigen adres, niet in een submap van versie 1**:

1. Maak een nieuwe, openbare repository, bijvoorbeeld **`Opleverinspectie-v2`**, en zet GitHub Pages aan (branch `main`, map `/`).
2. Upload de inhoud van deze map naar de hoofdmap van die repository (mappen `css`, `js`, `vendor`, `fonts`, `img`, `tests` en de losse bestanden, ook `.nojekyll`).
3. De app staat dan op `https://bas-oo.github.io/Opleverinspectie-v2/`. De vaste link van versie 1 blijft werken.
4. Op de iPad: open het adres in Safari en kies Deel › **Zet op beginscherm**. Zo opent de app schermvullend en ruimt iOS de gegevens niet op.

Waarom geen submap `Opleverinspectie/v2/`: de service worker van versie 1 geldt voor alles onder `/Opleverinspectie/`. Bij het eerste bezoek aan v2 slaat versie 1 dan de pagina van v2 op als zijn eigen offline-pagina; versie 1 opent daarna offline mogelijk niet. Dat is getest. Op een eigen adres gebeurt dit niet.

Nieuwe versie uitrollen: bestanden vervangen en in `sw.js` het `VERSIE`-nummer ophogen (en `APP_VERSIE` in `js/config.js`). De app meldt dan zelf dat er een nieuwe versie is.

Controlelijst bij uploaden via GitHub (Add files → Upload files): sleep de **inhoud** van de map in één keer naar de hoofdmap van de repository, dus de mappen `css`, `js`, `vendor`, `fonts`, `img`, `tests` en de losse bestanden. Staat een bestand in de lijst `BESTANDEN` in `sw.js` maar niet op GitHub, dan installeert de nieuwe versie niet. Bestanden die niet meer bestaan (zoals vroegere schermbestanden) mogen blijven staan; ze worden niet gebruikt.

## Werkwijze

**Complex → Blok → Object**, zoals in versie 1: het kruimelpad bovenin is de paginatitel, rechts staat één knop (Complex toevoegen ▾, Blok toevoegen, Object toevoegen) en alle andere acties staan onder het menu ☰ in de kop.

Per object zijn er acht tabbladen. Kruimelpad en tabbladen blijven onder de kop staan; de donkere tabknop schuift mee.

| Tabblad | Inhoud |
|---|---|
| Gegevens | Opdrachtgever en partijen (leeg = de standaard van het complex) |
| Vooropname | Puntkaarten: ruimte, omschrijving, A/B/C, foto, niet erkend. *+ Tekortkoming* maakt een nieuw punt |
| Oplevering | *Oplevering starten* legt de vooropname vast. Daarna per punt *Hersteld* of *Niet hersteld*, en nieuwe punten |
| Herstel | Nieuw in versie 2: binnen de termijn per punt *Hersteld (paraaf)* of *Nog open*; *+ Nagekomen punt* |
| Meterstanden | Ja/nee, netbeheerders, standen met foto |
| Overige zaken | Sleutels, raamsleutels, inregelrapporten enzovoort; *Kopiëren* van een andere woning |
| Afronden | Aandachtspunten (rood blokkeert, geel waarschuwt), plaats en datum, twee handtekeningvakken, de PDF's, *Afronding heropenen…*, eerdere versies en tekortkomingen exporteren (PDF of Excel) |
| Documenten | Nieuw in versie 2: alle vastgelegde processen-verbaal, met PDF en details (kenmerk, echtheidscontrole) |

Fases per object: **Vooropname → Oplevering → Herstelcontrole → Gereed**.

| Fase | Wat je doet | Wat er wordt vastgelegd |
|---|---|---|
| Vooropname | Punten vastleggen | Bij *Oplevering starten*: PV vooropname (niet ondertekend) |
| Oplevering | Elk vooropnamepunt beoordelen, nieuwe punten, meterstanden, overige zaken, ondertekenen op Afronden | PV oplevering, met beide handtekeningen |
| Herstelcontrole | Binnen de termijn (standaard 10 werkdagen) per punt *Hersteld (paraaf)* of *Nog open*; tekenen op Afronden | PV herstelcontrole per ronde; open punten gaan naar een volgende ronde |
| Gereed | Alles hersteld | — |

**Blok afronden** en **Complex afronden** (menu ☰) werken zoals in versie 1: aanvinken, één keer tekenen. Er ontstaat één verzamel-proces-verbaal; dat staat daarna onder *Verzamelafrondingen* op het blok- en complexscherm.

Kernregels:

- **Vaste nummers.** Een punt houdt zijn nummer in alle fases en documenten. Nummers worden nooit hergebruikt.
- **Eén punt, één record.** Een vooropnamepunt is in de oplevering hetzelfde punt, met een historie van elke wijziging.
- **Protocol afgedwongen.** Een open A- of B-punt blokkeert het ondertekenen (instelbaar). De C-limiet per woning en per blok geeft een waarschuwing.
- **Controle vóór tekenen.** Het tabblad Afronden toont rood (blokkeert) en geel (waarschuwing), en elke melding is een link naar het tabblad waar je het oplost.
- **Toch iets vergeten?** In de herstelcontrole: *nagekomen punt*. Zolang er nog niets is hersteld kan ook een **herziening** van de oplevering; die wordt opnieuw getekend en vervangt het eerdere PV, dat ongewijzigd bewaard blijft.
- **Gezamenlijk ondertekenen** (blok of complex): één verzamel-PV met per object de volledige lijst, de meterstanden en de overige zaken. Beide partijen tekenen dat ene document.

## Ondertekende documenten liggen vast

Bij ondertekenen wordt de PDF **één keer** gemaakt en opgeslagen. Downloaden levert daarna altijd exact hetzelfde bestand, ook na een nieuwe versie van de app.

- **Inhoudskenmerk**: SHA-256 over de vastgelegde inhoud (incl. een hash van elke foto en handtekening). Staat onderaan elke pagina.
- **SHA-256 van de PDF**: staat bij het document. Met *Controleer een PDF…* kies je een bestand, en de app zegt of het exact het vastgelegde document is.

## Exports

Op het tabblad Afronden en op het scherm Blok/Complex afronden: kies **PDF** of **Excel** en daarna deze woning, het blok of het hele complex. **Excel** (één regel per punt met kenmerk, plus een blad per object) en de **PDF**-tekortkomingenlijst zonder foto's. Dat zijn rapporten, geen ondertekende documenten.

## Importeren

*Complex toevoegen ▾ › Importeren via Excel*. Kolommen: `Adres`, of `Straat` + `Huisnummer` + `Toevoeging`; verder optioneel `Complex`, `Complexnaam`, `Blok`, `Woningtype`. Een toevoeging die met "alg" begint wordt een algemene ruimte. Ontbreekt de kolom Complex of Woningtype, dan vraagt de app erom. Bestaande adressen worden overgeslagen; er wordt nooit iets gewijzigd of verwijderd.

## Back-up (tot er een server is)

- Menu ☰ op het complexoverzicht: **Back-up maken (alles)**; in een complex: **Back-up van dit complex**. Onderaan het complexscherm staat wanneer de laatste back-up was. Formaat: `.jsonl`, met alle gegevens, foto's, handtekeningen en PDF's.
- De app herinnert je eraan als er wijzigingen zijn en de laatste back-up ouder is dan 20 uur.
- **Terugzetten**: *Samenvoegen* werkt **per record** (punt, object, blok) op wijzigingstijd, en verwijderingen gaan mee. Twee tablets in hetzelfde complex raken elkaars werk dus niet kwijt. *Alles vervangen* wist eerst de tablet.
- Back-ups van versie 1 kunnen niet worden ingelezen (ander gegevensmodel).

## Instellingen

Opdrachtgever, urgentieklassen (titel, uitleg, blokkeert ja/nee, limiet per woning en blok), hersteltermijn, verklaringsteksten, ruimtes (looproute), snelkeuzes voor de omschrijving, objecttypen, meters en overige zaken. Dit is allemaal data; wijzigen vraagt geen nieuwe code.

## Voor ontwikkeling

- Geen build-stap: gewone ES-modules, direct te hosten.
- Domeinregels in `js/model.js` (puur, zonder DOM). Testen: `node --test tests/*.test.js` (Node 20+).
- Opslag per record in IndexedDB (`js/store.js`), met `gewijzigd`, `rev` en grafstenen: klaar voor latere synchronisatie met een server.
- Bibliotheken in `vendor/`: jsPDF 2.5.2 met AutoTable, SheetJS 0.18.5. Lettertype Reddit Sans (SIL Open Font License).

## Bekende beperkingen

- Gegevens staan op één apparaat totdat er een server is; de back-up is het vangnet.
- Feestdagen tellen in de hersteltermijn mee als werkdag.
- Eén foto per punt, zoals afgesproken. Meer foto's per punt vraagt een aanpassing van het punt-record en de PDF.
- Gezamenlijk ondertekenen kan alleen voor de oplevering, niet voor de herstelcontrole.
