# Dungeon-Politur: Entscheidungsprotokoll

Auftrag (2026-11-20): Dungeon mit derselben Sorgfalt wie Hochstapler überarbeiten. Ich war eine Stunde ohne Rückfragen unterwegs, daher sind hier alle Entscheidungen samt Begründung festgehalten. Alles lässt sich leicht zurückdrehen.

## Ausgangslage (Ist-Stand vor der Überarbeitung)

**Was gut war:**
- Die Spielregeln funktionieren.
- Die Szene mit Fackeln und Holztüren ist ordentlich.
- Die Auswertung ist vollständig.

**Schwächen:**
- **Handy (393 × 660, iPhone 14 Pro Safari):** Szene, Karte, Knopf und Spielerliste ergeben eine lange Seite. Der Knopf „Durch die Tür gehen“ liegt unter dem Rand.
- **Leerlauf:** Nach jedem Ergebnis musste der Host „Nächste Türwahl“ drücken, sonst passierte nichts.
- **Wenig Wechselwirkung zwischen den Spielern:** Man sieht nicht, an welchen Türen andere schon gescheitert sind.
- **Wer zweimal falsch liegt, ist schnell draußen.** Ausscheiden heißt bei einer Party zuschauen.
- **Ergebnis ohne Spannung:** Richtig oder falsch erscheint sofort.
- **Kein Klang, keine Vibration.**
- **Fernseher:**
  - Unten ein Drittel leer.
  - Der Ausgang ist eine flache goldene Kachel.
  - Während der Antwortphase passiert nichts.
- **Auswertung:** Karten-Lösungen standen als Koordinaten da („56.88°, -5.43°“).

## Entscheidungen zu den Regeln (Server, in diesem Commit)

1. **Ergebnis läuft von selbst weiter.** Nach 9 Sekunden (`DUNGEON_RESULT_MS`) beginnt die nächste Türwahl, beziehungsweise die Auswertung, wenn niemand mehr im Dungeon ist. Der Host kann früher weiterschalten.
   *Warum:* Ohne Zeitlimit beim Antworten war das Warten auf den Host der zähste Moment. 9 Sekunden reichen für die Ergebnis-Animation (rund 3 s) und einen Blick auf den Fernseher.
2. **Schlüssel als Aufholhilfe.** Beim zweiten Fehlversuch findet man einmal je Dungeon einen Schlüssel (`DUNGEON_KEY_AT_WRONG = 2`).
   - Bei der Türwahl kann man statt „Durch die Tür gehen“ den Knopf „Mit Schlüssel aufschließen“ nehmen. Dann geht man ohne Frage hindurch, und der Schlüssel ist verbraucht.
   - Der Schlüssel öffnet jede Tür im Raum, auch eine, die für einen schon verschlossen ist.
   - Wer alle Türen zu hat, aber noch einen Schlüssel besitzt, scheidet nicht aus.

   *Warum:* Es ist eine echte Entscheidung (jetzt einsetzen oder für den strengen letzten Raum aufheben). Hinten liegende Spieler bleiben länger im Spiel. Und es passt zum Thema.
3. **Spuren an den Türen.** Jede Tür zeigt öffentlich, wer sie in früheren Runden geschafft hat und wer daran gescheitert ist, nie die Antwort.
   *Warum:* So entsteht Taktik („an der Tür sind schon zwei gescheitert“), und es verrät nichts. Ergebnisse waren schon vorher je Runde öffentlich, jetzt bleiben sie an der Tür stehen.
4. **Lösungen bleiben bis zur Auswertung geheim.** Das war schon so. Andere können dieselbe Tür später noch nehmen und bekommen dieselbe Frage.

## Entscheidungen zur Oberfläche (parallel von drei Agenten umgesetzt)

5. **Handy zuerst.**
   - Das Spiel passt ohne Scrollen auf 393 × 660 (iPhone 14 Pro in Safari) und auf 375 × 553 (iPhone SE).
   - Die Spielerliste wird zu einer Reihe Köpfe.
   - Die Aktion sitzt unten im Daumenbereich.
6. **Spannungsmoment beim Ergebnis.**
   - Kurz schließen sich alle Türen.
   - Dann öffnen sie sich nacheinander: Bei richtigen Antworten fällt Licht heraus und die Figur geht hindurch. Bei falschen schlägt die Tür zu, das Gitter fällt, und die Figur wird zurückgeworfen.
   - Gespielt wird das auf dem Gerät, der Server liefert das Ergebnis wie bisher.
7. **Klang und Vibration** (Web Audio, synthetisch, keine Dateien): Schritte, Knarren, Zuschlagen, Glocke bei richtig, dumpfer Ton bei falsch, Klimpern beim Schlüssel. Es gibt einen Stummschalter.
8. **Fernseher als Übertragung.**
   - Der Dungeon wird als Karte mit Gängen gezeigt und nutzt die ganze 16:9-Fläche.
   - Live-Status je Spieler.
   - Der Ausgang ist ein Tor mit Tageslicht.
   - Die Auswertung bekommt ein Podium.
9. **Auswertung:** Bei Karten-Türen stehen Ortsname und Entfernung statt Koordinaten.

## Bewusst nicht gemacht

- **Zeitlimit beim Antworten:** So war es früher abgestimmt („nie ein Zeitlimit“).
- **Lösungen nach jeder Runde:** würden die Tür für andere verraten.
- **Fallen oder Störer gegen andere Spieler:** Das wäre ein großer Eingriff in ein Wissensspiel. Erst ausprobieren, ob Schlüssel und Spuren reichen.

## Weitere Entscheidungen beim Umsetzen

- **Spannungsdauer:** 1,7 s Spannung, dann je Spieler 0,42 s versetzt. Der eigene Spieler wird zuerst aufgelöst, damit der Text auf dem Handy zur eigenen Tür passt.
- **Gleicher Takt auf allen Geräten:** Szene, Handy-Text, Köpfe-Reihe, Fernseh-Karten und Ticker zeigen richtig/falsch erst nach der Spannung. Den Takt rechnen alle aus `nextAt` und der Serverzeit, so stimmt er auch nach dem Neuladen.
- **Neuladen mitten im Ergebnis:** zeigt sofort den Endzustand, ohne die Spannung noch einmal abzuspielen.
- **Fernseher bei 6–7 Räumen:** zwei Reihen als Schlange, der Ausgang unten links.
- **Protokoll der Auswertung am Fernseher:** blättert von selbst (6 Türen je Seite). Am Handy darf es scrollen.
- **Lösungen bei a/b/c/d:** zeigen jetzt auch die Antwortmöglichkeiten. Bei Top X steht die ganze Liste, am Handy aufklappbar.
- **Nebenbei behoben:** In Hochstapler wurden die Glocken-Klänge stark verspätet abgespielt, weil der Zeitversatz doppelt gezählt wurde.

## Ergebnis

**Prüfung:**
- 489 Tests grün, `check` ohne Fehler und Warnungen, der Build läuft.
- Im Browser durchgespielt, ohne Fehler in der Konsole:
  - Handy auf 393 × 660 und 375 × 553: kein Scrollen in allen Phasen, auch mit Tastatur.
  - Fernseher auf 1280 × 720 und 1920 × 1080 mit 3, 5 und 7 Räumen und 3–6 Spielern: kein Scrollen.

**Offen:**
- Auf einem echten iPhone ist es noch nicht getestet (Klang, Vibration, Tastatur).
- Die Szene auf sehr hohen Handys hat viel Boden unter den Türen.
- Ohne gewählte Figur erscheinen Strichmännchen.
- Bei 6 Rausgekommenen wird das Ausgangstor eng.

## Nachtrag 2026-11-20: Schlüssel und automatisches Weiter wieder entfernt

Auf Wunsch des Nutzers sind die Entscheidungen 1 (Ergebnis läuft von selbst weiter) und 2 (Schlüssel als Aufholhilfe) zurückgenommen:
- Nach dem Ergebnis schaltet wieder nur der Host weiter. Auf dem Handy des Hosts steht dafür ein großer Knopf „Nächste Türwahl“ oder „Auswertung“, die anderen sehen „Der Host startet gleich …“.
- Den Schlüssel gibt es nicht mehr: kein Fund beim zweiten Fehlversuch, kein Aufschließen, keine Anzeige in Kopfzeile, Szene, Ticker und Auswertung. Sind alle Türen eines Raums zu, ist man wie früher raus.
- Für den Takt des Spannungsmoments meldet der Server jetzt `resultAt`, die Serverzeit, seit der das Ergebnis steht (vorher aus `nextAt` abgeleitet).
- Spuren an den Türen, Spannungsmoment, Klang, Handy-Ansicht, Fernseher und Auswertung bleiben.
