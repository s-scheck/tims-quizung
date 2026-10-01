# Tims Quizung

Multiplayer-Quiz-Suite für Freunde. Jeder spielt am eigenen Handy oder Laptop, optional zeigt ein Fernseher das Spielfeld. Spiele: **Sortieren**, **Top X** und **Zuordnen**. Der Host wählt vor jeder Runde das Spiel und die Kategorie, der Punktestand läuft über alle Runden durch.

## Spielregeln „Sortieren"

- Alle Karten einer Kategorie liegen offen, nur die Werte sind versteckt. Eine zufällige Karte startet die Kette.
- Wer dran ist, wählt eine Karte und eine Lücke in der Kette und bestätigt. Die Karte gleitet sofort an ihren Platz, nach zwei Sekunden Spannung wird sie grün oder fliegt zurück.
- Richtig heißt: Die Karte passt zwischen ihre Nachbarn. Falsch heißt: raus für diese Runde.
- Bleibt nur ein Spieler übrig, entscheidet der Host, ob die Runde endet oder der Letzte allein weiterlegt.
- Am Rundenende werden alle Werte aufgedeckt, der Host trägt Punkte pro Spieler ein. Danach nächste Runde oder Spiel beenden.
- Optionales Zeitlimit pro Zug (30 s / 60 s), bei Ablauf scheidet der Spieler aus.
- Der Host entscheidet in der Lobby, ob er mitspielt oder nur moderiert. Ein moderierender Host wählt Kategorien und vergibt Punkte, steht aber nicht in der Wertung.

## Spielregeln „Top X"

- Eine echte Top-Liste (z. B. Top 10 Fußballer nach Marktwert) liegt verdeckt auf nummerierten Plätzen. Vor der Runde legt der Host die Leben pro Spieler fest (1 bis 5).
- Wer dran ist, tippt einen Namen. Ein Treffer deckt die Karte mit Wert an ihrem Platz auf, ein Fehltipp kostet ein Leben. Auch ein Tipp auf eine schon aufgedeckte Karte oder ein wiederholter Fehltipp kostet ein Leben.
- Moderiert der Host, sieht er alle Karten und prüft jeden Tipp mit einem Vorschlag des Servers. Spielt er mit, entscheidet der Server automatisch: Name, Alias oder eindeutiger Nachname, ohne Tippfehler-Toleranz.
- Ohne Leben ist man für die Runde raus. Bleibt nur einer übrig, entscheidet der Host wie bei Sortieren. Die Runde endet, wenn alle Karten offen sind oder niemand mehr Leben hat.
- Zeitlimit und Punktevergabe funktionieren wie bei Sortieren.

## Spielregeln „Zuordnen"

- Eine Kategorie gibt Karten (z. B. Hauptstädte) und mehr Ziele (z. B. Länder) vor. Die überzähligen Ziele sind Köder ohne passende Karte. Vor der Runde legt der Host die Leben fest.
- Wer dran ist, wählt eine Karte und ein Ziel und bestätigt. Nach zwei Sekunden bleibt die Karte grün im Zielfeld liegen oder fliegt rot zurück und kostet ein Leben. Ob ein Ziel ein Köder war, bleibt geheim.
- Der moderierende Host sieht Lösung und Köder, alle anderen nicht.
- Rundenende, Host-Entscheidung, Zeitlimit und Punkte wie bei den anderen Spielen.

## Entwicklung

Voraussetzung: [Bun](https://bun.sh) ≥ 1.4.

```bash
bun install
bun run dev        # Vite auf http://localhost:5173, Bun-Server auf :3000 (WebSocket wird durchgereicht)
bun test           # alle Tests (Regeln, Content, Raum, Spielablauf, WebSocket)
bun run check      # TypeScript und svelte-check
```

Zum Testen zwei Browserfenster öffnen (eines privat): Raum erstellen, Code im zweiten Fenster eingeben. Die TV-Ansicht liegt unter `/screen/CODE`.

## Produktion

```bash
bun run build                       # baut apps/web/dist
bun run start                       # Server auf :3000 liefert Frontend + WebSocket aus
```

Oder mit Docker:

```bash
docker compose up --build -d
```

Umgebungsvariablen: `PORT` (Standard 3000), `ROOM_TTL_MINUTES` (Räume ohne Aktivität verfallen, Standard 120), `WEB_DIST` (Pfad zum Frontend-Build).

HTTPS und Domain übernimmt ein Reverse-Proxy davor (Caddy, nginx, Traefik). WebSockets müssen auf `/ws` durchgereicht werden.

## Struktur

```
apps/web          Svelte 5 + Vite + Tailwind v4, reine SPA
apps/server       Bun.serve mit WebSockets, Räume im Speicher, Spiellogik
packages/shared   Typen, WS-Protokoll, reine Spielregeln (getestet)
packages/content  Kategorien als JSON (nur der Server liest sie)
```

Der Server ist autoritativ: Nach jeder Änderung schickt er allen im Raum die komplette Sicht, Kartenwerte fehlen darin bis zur Auflösung. Der Client rendert nur. Reconnect läuft über ein Token im localStorage.

## Kategorien ergänzen

Eine Datei `packages/content/categories/<id>.json` anlegen:

```json
{
  "id": "beispiel",
  "title": "Titel",
  "question": "Was ist größer?",
  "topLabel": "größter Wert",
  "bottomLabel": "kleinster Wert",
  "unit": "km",
  "order": "desc",
  "source": "Quelle, Jahr",
  "items": [{ "name": "A", "value": 10 }, { "name": "B", "value": 5 }]
}
```

Regeln: 10 bis 20 Einträge, Namen und Werte eindeutig, `order` `desc` (größter Wert oben) oder `asc` (kleinster oben). `valueFormat: "plain"` unterdrückt Tausenderpunkte, etwa bei Jahreszahlen. Ein optionales `label` pro Eintrag überschreibt die Anzeige des Werts. `bun test` prüft alle Dateien.

Für Zuordnen gibt es Paarlisten statt Werten:

```json
{
  "id": "match-beispiel",
  "title": "Hauptstädte",
  "question": "Welche Hauptstadt gehört zu welchem Land?",
  "leftLabel": "Hauptstadt",
  "rightLabel": "Land",
  "games": ["match"],
  "pairs": [{ "left": "Lima", "right": "Peru" }, { "left": "Oslo", "right": "Norwegen" }],
  "decoys": ["Chile", "Lettland"]
}
```

Regeln: 4 bis 12 Paare, 0 bis 5 Köder, Karten, Ziele und Köder jeweils eindeutig, kein Köder darf ein Ziel sein. Wichtig beim Schreiben: Kein Köder darf fachlich zu einer Karte passen. Dateien beginnen mit `match-`.

Für Top X kommt `"games": ["topx"]` dazu (Standard ist `["sort"]`, beides zusammen geht auch). Top-X-Listen müssen echte Top-Listen ohne Gleichstand über die Listengrenze sein, dürfen ab 5 Einträgen kurz sein und Gleichstände enthalten. Pro Eintrag helfen `aliases` beim Abgleich, etwa `["Mbappe", "Mbappé"]`; ein eindeutiger Nachname trifft automatisch. Dateien beginnen mit `topx-`.

## Weitere Spiele

Ein Spiel ist ein `GameModule` (`apps/server/src/games/registry.ts`) mit `startRound`, `handle`, `roundView` und einigen Hooks. Timer, Host-Entscheidung, Auflösung, Punkte und Rundenwechsel liefert `games/common.ts` für alle Spiele. Der Raum kümmert sich um Spieler, Host, Scores und Lobby. Client-seitig schaltet `routes/Room.svelte` nach `view.phase` und `view.round.game`. Module werden in `games/index.ts` registriert.
