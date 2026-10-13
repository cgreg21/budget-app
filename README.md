# Budget App

An [Adwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/) application built
with [node-gtk](https://github.com/romgrk/node-gtk) and TypeScript.

## Prerequisites

You need GTK 4 and libadwaita — plus their GObject-Introspection data — installed
on your system. node-gtk talks to the libraries you actually have installed.

- **Fedora:** `sudo dnf install gtk4-devel libadwaita-devel gobject-introspection-devel`
- **Debian/Ubuntu:** `sudo apt install libgtk-4-dev libadwaita-1-dev gobject-introspection`
- **Arch:** `sudo pacman -S gtk4 libadwaita gobject-introspection`
- **macOS (Homebrew):** `brew install gtk4 libadwaita gobject-introspection`

The `-dev`/`-devel` packages also ship the `.gir` files used to embed GNOME's API
documentation into the generated TypeScript types (shown on hover in your editor).

You also need **Node.js ≥ 20.6** (for the `gi:` import hooks).

## Getting started

```sh
npm install        # installs deps (fetches budget-lib from Git) and generates TypeScript types (postinstall)
npm run dev        # run the app with live reload
```

That's it — a window should appear. Edit `style.css` while it runs and the
window restyles instantly, no restart. To also restart the app when you edit
`src/`, run `npm run dev:app-reload` instead (it adds `node --watch`).

## Flatpak Linux

The project includes a Flatpak target under `flatpak/`. Install Flatpak and
`flatpak-builder`, then run:

```sh
npm install
npm run flatpak:build
npm run flatpak:run
```

To create a distributable file after building:

```sh
npm run flatpak:bundle
```

This creates `budget-app.flatpak`. The manifest builds the TypeScript app and
its native `node-gtk` dependency inside the GNOME 48 SDK, and includes the
bundled SVG assets. The build currently targets Linux x86_64 because it embeds
the matching Node.js runtime; an ARM64 manifest needs a separate Node.js
archive.

## AppImage Linux

To build a portable AppImage, install `curl` and `tar`, then run:

```sh
npm install
npm run appimage:build
```

The script downloads the matching Node.js and `linuxdeploy` binaries, builds
the application, embeds the runtime, `node-gtk`, assets and stylesheet, then
creates `Budget_App-x86_64.AppImage` (or the matching ARM64 filename) at the
project root. The GTK 4 and libadwaita libraries remain provided by the host
system, as is customary for GTK applications.

## Windows

Build the portable Windows x64 bundle from PowerShell on Windows:

```powershell
npm install
npm run windows:build
```

This creates `Budget-App-windows-x64.zip` with a Node.js runtime, the compiled
application, native dependencies and a `Budget App.cmd` launcher. GTK 4 and
libadwaita must be installed on the Windows machine.

## macOS Apple Silicon

Build the arm64 `.app` bundle on an Apple Silicon Mac:

```sh
npm install
npm run macos:arm:build
```

This creates `Budget-App-macos-arm64.zip`. GTK 4 and libadwaita are expected
from Homebrew on the target Mac.

## How it works

Namespaces are imported with the `gi:` scheme, and their default export is the
namespace object:

```ts
import Gtk from 'gi:Gtk-4.0'
import Adw from 'gi:Adw-1'
```

For those imports to resolve, node-gtk's loader hooks must be installed, which is
why the app is run with `node --import node-gtk/register`. The `dev`/`start`
scripts already include this (along with `tsx`, which runs the TypeScript without
a separate build step). node-gtk integrates the GTK main loop with Node's event
loop automatically.

## Scripts

| command                  | what it does                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `npm run dev`            | Run with live CSS reload — edit `style.css`, the window restyles, no restart. |
| `npm run dev:app-reload` | Like `dev`, but also restarts the app when you edit `src/` (`node --watch`). |
| `npm start`              | Run once without building.                                        |
| `npm run build`     | Type-check and compile `src/` to `dist/` with `tsc`.             |
| `npm run typecheck` | Type-check only, no output.                                      |
| `npm test`               | Run the unit test suite once (Vitest).                       |
| `npm run test:watch`     | Re-run the affected tests as you edit.                       |
| `npm run test:coverage`  | Run the suite and report coverage for `src/`.                |
| `npm run generate-types` | (Re)generate TypeScript types for the GI namespaces you use. |

## TypeScript types

Types are generated **on your machine** from the GObject-Introspection typelibs
you have installed, so they match your actual library versions and node-gtk's
runtime shape (camelCase methods, typed signals, nullability, …). They live in
`node_modules/.node-gtk-types/` (git-ignored) and `tsconfig.json` points at them.

The `postinstall` script regenerates them automatically. If you start using
another library, add it to the `generate-types` script in `package.json` and
re-run it:

```jsonc
// package.json
"generate-types": "node-gtk generate-types Gtk-4.0 Adw-1 GtkSource-5"
```

```sh
npm run generate-types
```

## Project structure

The code is organised in layers, from the model outwards to the toolkit:

```
.
├── src/
│   ├── main.ts                       # bootstrap — loads the stylesheet, starts the app
│   ├── data/                         # persistence
│   │   ├── paths.ts                  #   where the JSON files live
│   │   ├── id.ts                     #   identifiers shared by the stores
│   │   ├── json-file-store.ts        #   observable store: load / commit / watch / dispose
│   │   ├── month-store.ts            #   one month = one file (months/YYYY-MM.json)
│   │   ├── budget-store.ts           #   the month history: selection, routing, recurrences
│   │   ├── legacy-migration.ts       #   splits an old transactions.json by month
│   │   ├── thresholds-store.ts       #   thresholds.json
│   │   ├── recurrence-store.ts       #   recurrences.json
│   │   ├── backup-service.ts         #   import / export, JSON archive and CSV
│   │   ├── category-store.ts         #   categories.json
│   │   ├── secure-store.ts           #   secrets: keyring → macOS Keychain → DPAPI → encrypted file
│   │   ├── bank/                     #   the bank import (Enable Banking)
│   │   │   ├── bank-service.ts       #     connect, import, automatic import
│   │   │   ├── bank-state-store.ts   #     bank.json (local only)
│   │   │   ├── bank-key-store.ts     #     the private key: system keyring, then environment
│   │   │   ├── node-bank.ts          #     fetch transport and RS256 signature
│   │   │   ├── secret.ts             #     optional libsecret bindings for the bank key
│   │   │   └── redirect-listener.ts  #     catches the bank's return on localhost
│   │   └── calendar/                 #   optional transaction sync via CalDAV
│   │       ├── calendar-sync-service.ts # serialized runs, debounce and offline retry
│   │       ├── calendar-state-store.ts # calendar.json: settings and baseline
│   │       ├── calendar-password-store.ts # password in the secure store, never in files in clear
│   │       └── node-calendar.ts       # Node fetch HTTP transport
│   ├── ui/                           # everything GTK
│   │   ├── gtk-types.ts              #   GTK/Adw instance-type aliases
│   │   ├── types.ts                  #   Component / Notify contracts
│   │   ├── format.ts                 #   currency, date, month and percent formatting
│   │   ├── widgets.ts                #   small widget builders shared by views
│   │   ├── icons.ts                  #   the palette of icons offered to categories
│   │   ├── cairo.ts                  #   hand-written typing for the Cairo context
│   │   ├── views/
│   │   │   ├── budget-view.ts        #     window content, wired to the store
│   │   │   ├── month-switcher.ts     #     ‹ Septembre 2026 › navigator + month picker
│   │   │   ├── summary-cards.ts      #     balance (colour-banded) / income / expenses
│   │   │   ├── category-charts.ts    #     pie charts by category, in the side column
│   │   │   ├── transaction-list.ts   #     list + empty state
│   │   │   ├── transaction-filters.ts #    search field, kind + categories, reset
│   │   │   ├── list-total.ts        #     count and total of the shown rows
│   │   │   └── transaction-row.ts    #     a single row
│   │   └── dialogs/
│   │       ├── form-dialog.ts        #     shell shared by the "new / edit" forms
│   │       ├── category-combo.ts     #     the "Catégorie" row, icons included
│   │       ├── icon-picker-dialog.ts #     the icon grid for a category
│   │       ├── transaction-dialog.ts #     add / edit a transaction, repetition included
│   │       ├── edit-scope-dialog.ts  #     "cette occurrence ou toute la série ?"
│   │       ├── confirm-delete-dialog.ts # "supprimer « … » ?", before every deletion
│   │       ├── recurrence-dialog.ts  #     add / edit a recurrence
│   │       ├── occurrence-count-field.ts # optional "how many times?" field
│   │       ├── options-dialog.ts     #     the options window: one tab per section
│   │       ├── thresholds-group.ts   #     "Seuils" tab: x / y / z settings
│   │       ├── recurrences-group.ts  #     "Récurrences" tab: recurring transactions
│   │       ├── categories-group.ts   #     "Catégories" tab: category management
│   │       ├── data-group.ts         #     "Données" tab: import / export
│   │       ├── calendar-group.ts      # Calendar tab: CalDAV settings and status
│   │       ├── file-dialogs.ts       #     choosing a file to read or write
│   │       ├── import-mode-dialog.ts #     "remplacer ou fusionner ?"
│   │       └── about-dialog.ts
│   └── app/                          # composition root
│       ├── app-info.ts               #   id, name, version
│       ├── main-window.ts            #   window + header bar
│       └── application.ts            #   lifecycle, actions, shutdown
├── test/                             # Vitest suites, mirroring src/
│   ├── helpers/                      #   a throwaway data dir, GLib and libsecret stubs
│   ├── data/                         #   the stores, against real files in a temp dir
│   └── ui/                           #   the pure helpers (formatting, icons)
├── style.css          # custom CSS (hot-reloads live under `npm run dev`)
├── vitest.config.ts   # test setup: GI aliases, coverage thresholds
├── tsconfig.json
└── package.json
```

Dependencies only point downwards: `app` → `ui` → `data` → `budget-lib`. The model and
its rules (transactions, months, recurrences, backup, CSV…) come from the
sibling package [`budget-lib`](https://github.com/cgreg21/budget-lib), shared with the mobile app. It is plain
TypeScript and is tested in its own project.

## Gestion de budget personnel

Cette application permet de suivre revenus et dépenses, **mois par mois** :

- Navigation entre les mois via la barre d'en-tête : flèches ‹ › d'un mois à l'autre, et menu déroulant proposant un sélecteur d'année ‹ 2026 › avec la grille des douze mois. **N'importe quel mois, passé ou futur, peut être affiché**, qu'il contienne des données ou non ; un point signale ceux qui en contiennent et un raccourci ramène au mois courant.
- **Tout mois chargé est modifiable** : ajout, modification (clic sur une ligne ou icône crayon) et suppression s'appliquent au mois affiché.
- **Toute suppression demande confirmation** : transaction, récurrence ou catégorie, le bouton corbeille ouvre d'abord une alerte nommant l'élément visé et rappelant ce que l'opération emporte — et ce qu'elle épargne. Le bouton *Supprimer* y est marqué comme destructeur et n'est jamais la réponse par défaut : Entrée ou Échap annulent.
- Ajout d'une transaction (revenu ou dépense) via le bouton **+**, avec description, montant, catégorie, type **et répétition** (Ponctuelle, Mensuelle, Trimestrielle, Annuelle). Elle est datée du jour si le mois courant est affiché, sinon du 1er du mois affiché — elle se range donc toujours dans le mois consulté.
- Résumé du mois affiché : solde, total des revenus, total des dépenses.
- **Barre de filtres au-dessus de la liste** : un champ de recherche (sur la description **et** la catégorie, insensible à la casse **et aux accents** — `electricite` trouve « Électricité »), un menu **Tous / Revenus / Dépenses**, un menu **de catégories à choix multiple** (cases à cocher ; son libellé indique « Toutes », la catégorie retenue, ou « 3 catégories »), et un bouton croix qui remet le tout à zéro (actif seulement quand un filtre l'est). Le filtre ne change que ce qui est affiché : résumé et graphiques continuent de décrire le mois entier, et il reste en place d'un mois à l'autre pour suivre une dépense dans le temps. Si plus rien ne correspond, la liste l'annonce au lieu de paraître vide. Renommer ou supprimer une catégorie cochée décoche simplement celle-ci.
- **Sous la liste, un total de ce qui est affiché** : le nombre de lignes (« 12 transactions sur 34 » dès qu'un filtre est posé) et leur montant, vert ou rouge selon le signe. C'est un **solde**, pas une somme : une liste mêlant revenus et dépenses additionnerait sinon un salaire à un loyer. Filtrée sur un seul type, elle se lit donc comme le total de ce type.
- **Chaque ligne de la liste porte une bordure de couleur à gauche** : verte pour un revenu, rouge pour une dépense. Le montant suit la même règle, et l'icône de catégorie apparaît **en blanc sur une pastille ronde de cette couleur**.
- **Le solde prend une couleur de fond selon son montant** : rouge en dessous de `x`, orange de `x` à `y`, jaune de `y` à `z`, vert à partir de `z`.
- Graphiques en camembert des dépenses et des revenus par catégorie, pour le mois affiché, présentés dans une **colonne à droite de la liste des transactions** : elle occupe un quart de la largeur de la fenêtre, et les deux camemberts s'y partagent la hauteur à parts égales.
- **Transactions récurrentes** (loyer, salaire, abonnement…) : fréquence **mensuelle, trimestrielle ou annuelle**, jour du mois et mois de départ. Chaque occurrence est créée automatiquement **à l'ouverture du mois concerné** et posée sur un **fond plus sombre** dans la liste ; **la survoler affiche un panneau** rappelant la série dont elle vient — fréquence, jour, période et date de l'occurrence. Le jour est ramené au dernier jour des mois plus courts (un 31 devient le 28 en février). Supprimer une occurrence la fait réapparaître à la prochaine ouverture du mois ; supprimer la récurrence ne touche pas aux transactions déjà créées.
- La répétition se règle **directement depuis la transaction** : choisir une fréquence lors de l'ajout crée la série (même jour, à partir de ce mois-ci) ; la choisir en modification transforme la transaction en première occurrence ; revenir à « Ponctuelle » arrête la série.
- Une série est **illimitée par défaut**, mais peut recevoir une **durée** : activer « Durée limitée » puis indiquer un **nombre d'occurrences** (1 à 600, par exemple 12 fois). La série s'arrête alors d'elle-même ; l'onglet Récurrences affiche la période complète (« Janvier 2033 → Décembre 2033 (12 fois) »). Le nombre reste modifiable à tout moment, pour allonger, raccourcir ou revenir à l'illimité.
- À l'enregistrement d'une transaction récurrente, l'application **demande la portée** : *cette occurrence* (la récurrence reste inchangée) ou *toute la série* (le modèle suit, les mois à venir aussi). Un changement de fréquence ne peut porter que sur la série ; le jour et le mois de départ de la série sont préservés.
- **Chaque catégorie porte une icône**, choisie dans un sélecteur de 40 icônes (maison, panier, voiture, santé, loisirs…) ouvert depuis le bouton d'icône de l'onglet Catégories. Elle apparaît partout : devant chaque ligne de transaction, dans le menu déroulant « Catégorie » des formulaires et dans la liste des options. Renommer une catégorie conserve son icône, et changer l'icône ne touche à aucune transaction.
- Options (menu principal ☰, première entrée), en sept onglets : **Général** (préférences locales), **Seuils** (réglage de `x`, `y` et `z`, positifs ou négatifs, enregistrés uniquement si `x < y < z`), **Récurrences** (ajout, modification, suppression), **Catégories** (ajout, renommage, choix d'icône, suppression), **Données** (import / export), **Banque** (import bancaire) et **Agenda** (synchronisation CalDAV).
- **Import / export**, depuis l'onglet Données :
  - **Sauvegarde complète** dans un fichier `.json` : catégories, seuils, récurrences et tous les mois de l'historique. À la relecture, l'application demande quoi en faire — **Fusionner** (les données actuelles sont conservées, seul ce qui manque est ajouté) ou **Remplacer** (le fichier devient la référence ; les mois qu'il ne contient pas sont supprimés). La fusion repère les doublons par leur contenu autant que par leur identifiant : réimporter deux fois la même sauvegarde n'ajoute rien la seconde fois.
  - **Export CSV** des transactions de tous les mois (`date;description;catégorie;type;montant`, décimales à la virgule, BOM UTF-8) : le fichier s'ouvre directement dans Excel ou LibreOffice.
  - **Import CSV** : chaque ligne rejoint le mois de sa date et **s'ajoute** aux transactions existantes. La lecture est tolérante — séparateur `;`, `,` ou tabulation, en-tête facultatif, dates `2026-09-17` ou `17/09/2026`, montants du genre `1 234,56 €`, type déduit du signe s'il manque — et les catégories inconnues sont créées. Les lignes illisibles sont comptées et ignorées.

### Stockage

Le budget est conservé sur cette machine et reste modifiable sans connexion
réseau. La synchronisation facultative CalDAV partage uniquement les transactions
avec le calendrier choisi (voir ci-dessous). Les données sont écrites en JSON sous le répertoire de données utilisateur
(`%LOCALAPPDATA%\budget-app\` sous Windows, `~/.local/share/budget-app/` sous Linux) :

```
budget-app/
├── calendar.json       # configuration CalDAV, dernier succès et référence locale
├── categories.json     # la liste des catégories : nom + icône
├── thresholds.json     # les seuils x / y / z du solde
├── recurrences.json    # les transactions récurrentes
├── bank.json           # la connexion bancaire (réglages, accès, imports) — locale
└── months/
    ├── 2026-08.json    # un fichier par mois — l'historique
    └── 2026-09.json
```

Chaque fichier est surveillé : s'il est modifié en dehors de l'application (autre
instance, édition manuelle), l'interface se recharge
automatiquement. L'apparition d'un nouveau fichier de mois est détectée de la
même façon.

Consulter un mois ne crée rien : le fichier d'un mois n'apparaît qu'à sa première
transaction — ou dès sa consultation si une récurrence y est due, puisque
l'occurrence y est alors écrite.

Un ancien `transactions.json` (format mono-fichier) est réparti automatiquement
par mois au démarrage, puis renommé en `transactions.json.migrated` — rien n'est
supprimé.

Un `categories.json` écrit par une version antérieure (simple liste de noms,
`["Alimentation", …]`) est relu sans erreur : les icônes sont rétablies en
mémoire et le fichier n'est réécrit au nouveau format `{ "name", "icon" }` qu'à
la première modification d'une catégorie.

Ces fichiers restent le seul état de l'application : une sauvegarde exportée
depuis l'onglet **Données** n'est que leur réunion dans un document unique,
marqué `"format": "budget-app-backup"` et `"version"`, ce qui permet de refuser
proprement un fichier qui n'en est pas une. Restaurer une sauvegarde les
réécrit d'un bloc, puis l'interface se recharge sans qu'il soit nécessaire de
redémarrer.

### Import bancaire

L'onglet **Banque** des options importe les transactions d'un compte bancaire
via [Enable Banking](https://enablebanking.com) (gratuit pour ses propres
comptes). Le protocole (jeton RS256, requêtes, correspondance vers les
catégories) vient de `budget-lib` et est partagé avec l'application mobile.

Préparation :

1. Créer une application sur enablebanking.com et y lier ses comptes ;
2. y déclarer l'adresse de retour `http://localhost:8765/bank` ;
3. dans l'onglet, saisir l'identifiant de l'application et choisir le fichier PEM
   de sa clé privée, puis chercher la banque, **Connecter la banque** et
   autoriser l'accès dans le navigateur.

Au retour, l'application attrape elle-même la redirection : elle écoute le
temps d'une connexion sur `127.0.0.1:8765` et nulle part ailleurs. Avec une
autre adresse de retour, il suffit de coller dans le champ prévu l'adresse (ou
le code) où le navigateur aboutit.

La **clé privée** n'est écrite nulle part dans les fichiers du budget : elle est
confiée au trousseau du système (libsecret) ou, là où il est absent, lue dans
`BUDGET_APP_BANK_PRIVATE_KEY` (le contenu PEM). `bank.json` ne garde que les
réglages, l'accès accordé et les identifiants des transactions déjà importées :
une transaction supprimée du budget n'est pas réimportée, et importer deux fois
ne crée jamais de doublon. Les transactions rejoignent le mois de leur date sans
changer le mois affiché.

La banque demande de renouveler l'accès environ tous les 90 jours et limite les
accès automatiques à quelques-uns par jour : l'application importe donc au
démarrage puis toutes les 30 minutes **si le dernier import date de plus de six
heures**. « Importer maintenant » force un import.

## Synchronisation avec un agenda CalDAV

Le service desktop `CalendarSyncService` se configure dans cet onglet.
La synchronisation est désactivée par défaut. Utilisez un calendrier dédié
accessible avec une authentification HTTP Basic (mot de passe d’application si requis).
Exemple : `https://cloud.example.com/remote.php/dav/calendars/user/budget`.

L’onglet **Agenda** des options configure l’adresse d’un calendrier CalDAV, le nom d’utilisateur et le mot de passe. Utilisez l’URL de la collection fournie par votre service (par exemple Nextcloud). **Tester la connexion** vérifie les identifiants sans enregistrer les champs ; **Enregistrer les réglages** applique les changements et **Synchroniser maintenant** lance une synchronisation immédiate. Le mot de passe n’est jamais relu dans l’interface ni écrit dans les fichiers du budget : il est conservé dans le trousseau du système ou, à défaut, chiffré sur cet ordinateur (voir plus bas). Si aucun stockage sûr n’est possible, l’application le signale et n’enregistre pas le secret.

Les transactions sont synchronisées sous forme d’événements **sur la journée**, pour que le même calendrier soit exploitable sur ordinateur, mobile et web. Les identifiants et marqueurs de synchronisation restent gérés localement pour reconnaître les événements du budget et éviter les doublons. La configuration, le dernier état et la référence de synchronisation restent locaux ; une indisponibilité du réseau n’empêche pas de consulter ou modifier le budget et la synchronisation reprend quand l’application revient au premier plan. Les modèles de récurrence restent propres au budget : ils ne sont pas créés comme règles de calendrier.

Le transport utilise le `fetch` global de Node (version indiquée dans `.nvmrc` :
26.9.0), avec un délai limite de 30 secondes. Il envoie PROPFIND, REPORT, PUT
et DELETE, conserve les erreurs HTTP comme réponses et normalise les noms
d’en-têtes en minuscules. Le client desktop n’est pas soumis aux restrictions CORS.

Les transactions de **tous les mois** sont synchronisées au démarrage, deux secondes
après leur dernière modification (imports bancaires inclus), au retour du réseau
et au premier plan, ou sur demande. Après une panne réseau, une nouvelle tentative
a lieu chaque minute. Les exécutions sont sérialisées ; une modification pendant
un transfert déclenche un nouveau passage sans écraser la saisie locale.
Les catégories manquantes des transactions téléchargées sont créées avec leur
icône par défaut. Les suppressions se propagent dans les deux sens ; si les deux
côtés ont modifié le même événement, le calendrier l’emporte au prochain passage.

Chaque occurrence récurrente est un événement ordinaire (pas de RRULE). Son
marqueur `recurrenceId` est conservé pour que la réapplication d’un modèle local
ne crée pas une seconde occurrence. Les modèles, catégories complètes, seuils,
préférences et accès bancaires ne sont pas envoyés. Le fichier
`calendar.json` contient la configuration **sans mot de passe**, la référence
de synchronisation et la date du dernier succès ; ces réglages ne font pas partie
des sauvegardes. Changer de calendrier ou d’utilisateur réinitialise la référence,
jamais les transactions locales.

Le mot de passe est conservé de façon permanente par le premier stockage sûr
disponible (`src/data/secure-store.ts`), dans cet ordre :

1. le trousseau du système via `gi:Secret-1` (libsecret : GNOME Keyring, KWallet…) ;
2. le trousseau macOS, via l’outil `security` ;
3. la protection des données Windows (DPAPI, via PowerShell), liée au compte
   Windows courant ; le chiffré est rangé dans `secrets.json` ;
4. à défaut, un chiffrement AES-256-GCM dans `secrets.json` avec une clé
   aléatoire conservée dans `secrets.key`, lisible uniquement par l’utilisateur.

L’onglet Agenda indique lequel est utilisé. Aucun de ces fichiers ne fait partie
des sauvegardes et le mot de passe n’est jamais écrit en clair ni lu dans
l’environnement.

## Tests

La logique — les stores, les rares fonctions pures de l'interface —
est couverte par [Vitest](https://vitest.dev/), sans GTK :

```sh
npm test               # la suite complète
npm run test:coverage  # la même, avec le rapport de couverture
```

Les suites vivent dans `test/`, en miroir de `src/`. Les stores sont testés
contre de vrais fichiers, dans un répertoire temporaire créé pour chaque fichier
de test ; les deux bibliothèques GI dont la couche données dépend (`GLib` pour
le chemin des données, `Secret` pour le trousseau) sont remplacées par des stubs
déclarés dans `vitest.config.ts`. Le code des widgets en est exclu : il demande
un vrai runtime GTK, et la logique sur laquelle il s'appuie est ailleurs.


## Learn more

- [node-gtk](https://github.com/romgrk/node-gtk) — the bindings
- [Importing libraries](https://github.com/romgrk/node-gtk/blob/master/doc/importing.md) — the `gi:` scheme and ESM details
- [GTK 4 API reference](https://docs.gtk.org/gtk4/)
- [libadwaita API reference](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/)
- [Adwaita style classes](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/main/style-classes.html)
