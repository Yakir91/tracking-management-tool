# Tracking Management Tool

A single-page web tool for planning and running FCI-IGP tracking trials and championships: FPr 1–3 (tracking phase of IGP 1–3) and FH 1–3 (FCI-IFH 1–3). The interface is in Hebrew.

Live: https://yakir91.github.io/tracking-management-tool/

Open `index.html` in a browser, or use the live site above. No build step and no server: everything runs in the browser and is saved in the browser's local storage. A trial can be shared as a link from the Share tab.

## What it does

- **Rules:** FCI-IGP 2025 trial regulations, including the 5 January 2026 change that set the minimum aging of FCI-IFH 1 to 60 minutes.

  | Level | Paces | Legs | Min. aging | Max. working time |
  |---|---|---|---|---|
  | FPr 1 | 300 | 3 | 20 min | 15 min |
  | FPr 2 | 400 | 3 | 30 min | 15 min |
  | FPr 3 | 600 | 5 | 60 min | 20 min |
  | FH 1 | 800 | 5 | 60 min | 30 min |
  | FH 2 | 1200 | 7 | 120 min | 30 min |
  | FH 3 | 1800 | 8 | 180 min | 45 min |

- **Track rules:** acute corners in FH 2 and FH 3, and a semicircle leg in FH 3. Articles stay at least 20 paces from a corner. The tracklayer continues at least 10 paces after the last article.
- **Map:**
  - Real map with satellite imagery and a street map.
  - Place search and current location.
  - An uploaded aerial image calibrated to scale, or a schematic grid.
- **Field layout:**
  - Mark one or more tracking fields and one or more access paths. Tracks fill the fields in the order they were marked; a field with no marked path gets automatic paths. The tool reports each field's size and whether the entries fit.
  - Tracks are placed side by side along the path, in working order. Each track starts from the path and exits back toward it.
  - At least 22 m separate any two tracks, including the exit of one track and the start of the next.
- **Just-in-time laying:**
  - Each track is laid so it reaches its minimum aging exactly when the judge is ready for its dog.
  - Tracks of one group are never laid at the same time.
- **Draws:**
  - Stranger-laid levels are split into groups of 3 or 6, chosen automatically by aging, and drawn right after the group's last track is laid.
  - Own-laid levels (FPr 1, FH 1) have no draw. Dogs work in laying order.
- **Cross track (FH 2, FH 3):**
  - One straight cross track crossing two inner legs once each.
  - It never crosses the first or last leg, and stays at least 40 paces from a corner.
  - It is laid about 30 minutes before the dog starts.
  - The cross-track layer can reach both ends from the access path without stepping on any track.
- **Walking routes:** routes for every layer avoid tracks that are already laid.
- **Judging order:** chosen automatically to shorten the trial.
- **Layer cards:** for each tracklayer, with paces, compass bearings and article positions.
- **Live mode:** record actual times, and the rest of the schedule re-flows around delays.

## Sources

- [FCI International Utility Dog Regulations (FCI-IGP) 2025](https://www.fci.be/medias/UTI-REG-IGP-en-2025-22401.pdf)
- [VDH notice on the FCI Utility Dog Commission modifications of 5.1.2026](https://adrk.de/attachments/article/2625/Modifizierung%20PO%202025.pdf)
