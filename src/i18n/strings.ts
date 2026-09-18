/*
 * i18n/strings.ts — every piece of text the UI shows, in French and English.
 *
 * `Strings` is the contract: both dictionaries must implement it in full, so
 * a translation missing from one of them is a compile error rather than a
 * blank label discovered at runtime. Dynamic text (counts, names, dates) is a
 * function instead of a plain string, so pluralisation and word order stay a
 * decision of the language rather than of the call site.
 *
 * `t()` returns the dictionary for the language the app currently runs in —
 * call sites read `t().categoriesGroup.added`, they never handle a key path.
 */
import { getLocale } from './locale.js'

export interface Strings {
  common: {
    cancel: string
    delete: string
    save: string
    add: string
    type: string
    frequency: string
    expense: string
    income: string
    noDescription: string
  }
  appInfo: {
    description: string
  }
  format: {
    frequency: {
      monthly: string
      quarterly: string
      yearly: string
    }
    recurrenceFrom(month: string): string
    recurrenceRange(start: string, end: string, occurrences: number): string
  }
  remoteStatus: {
    localStorage: string
    connecting: string
    online: string
    onlineSyncedAt(time: string): string
    offline: string
    errorDefault: string
  }
  icons: Record<IconKey, string>
  categoriesGroup: {
    existingCategoriesTitle: string
    newCategoryTitle: string
    nameFieldTitle: string
    addTooltip: string
    iconTooltip(iconLabel: string): string
    alreadyExists(name: string): string
    added: string
    iconChanged: string
    renamed: string
    deleteTooltip: string
    mustKeepOne: string
    deleteBody: string
    deleted: string
  }
  categoryCombo: {
    title: string
  }
  cloudGroup: {
    serverGroupTitle: string
    serverGroupDescription: string
    addressLabel: string
    addressTooltip(hint: string): string
    usernameLabel: string
    passwordLabel: string
    directoryLabel: string
    useServerLabel: string
    useServerSubtitle: string
    statusGroupTitle: string
    syncButton: string
    connectButton: string
    forgetButton: string
    passwordKeptSubtitle: string
    missingAddress: string
    keyringUnavailable: string
    noPasswordSaved: string
    disconnected: string
  }
  confirmDeleteDialog: {
    heading(name: string): string
  }
  editScopeDialog: {
    heading: string
    bodyOccurrence: string
    bodySeriesOnly: string
    occurrenceOption: string
    seriesOption: string
  }
  dataGroup: {
    operationFailed: string
    exportBackupTitle: string
    importBackupTitle: string
    exportCsvTitle: string
    importCsvTitle: string
    backupExported(description: string): string
    noTransactionsToExport: string
    backupGroupTitle: string
    backupGroupDescription: string
    exportBackupSubtitle: string
    exportButton: string
    importBackupSubtitle: string
    importButton: string
    csvGroupTitle: string
    csvGroupDescription: string
    exportCsvSubtitle: string
    importCsvSubtitle: string
    backupFilterName: string
    csvFilterName: string
    monthsCount(count: number): string
    transactionsCount(count: number): string
    categoriesCount(count: number): string
    recurrencesCount(count: number): string
    transactionsExportedCount(count: number): string
    transactionsImportedCount(count: number): string
    categoriesCreatedCount(count: number): string
    linesIgnoredCount(count: number): string
    restored(description: string): string
    nothingToAdd: string
    mergeCompleted(parts: string): string
    csvImportSummary(imported: string, monthsLabel: string): string
  }
  importModeDialog: {
    heading: string
    body(summary: string): string
    mergeOption: string
    replaceOption: string
  }
  iconPickerDialog: {
    title: string
  }
  occurrenceCountField: {
    limitedTitle: string
    limitedSubtitle: string
    countTitle: string
  }
  optionsDialog: {
    title: string
    thresholdsTab: string
    recurrencesTab: string
    categoriesTab: string
    dataTab: string
    cloudTab: string
  }
  recurrenceDialog: {
    defaultDescription(kind: 'income' | 'expense'): string
    transactionGroupTitle: string
    typeRow: string
    descriptionLabel: string
    amountLabel: string
    rhythmGroupTitle: string
    rhythmGroupDescription: string
    dayLabel: string
    daySubtitle: string
    startMonthLabel: string
    startYearLabel: string
    startYearSubtitle: string
    editTitle: string
    newTitle: string
  }
  recurrencesGroup: {
    groupTitle: string
    groupDescription: string
    dayPrefix(day: number): string
    editTooltip: string
    deleteTooltip: string
    updated: string
    deleteBody: string
    deleted: string
    addTooltip: string
    added: string
    emptyTitle: string
    emptySubtitle: string
  }
  thresholdsGroup: {
    groupTitle: string
    groupDescription(rule: string): string
    lowLabel: string
    mediumLabel: string
    highLabel: string
    orderError(rule: string): string
    saved: string
    saveButton: string
  }
  transactionDialog: {
    defaultDescription(kind: 'income' | 'expense'): string
    typeRow: string
    amountLabel: string
    onceLabel: string
    repeatGroupTitle: string
    repeatGroupDescription: string
    editTitle: string
    newTitle: string
  }
  budgetView: {
    edited: string
    editedRecurring: string
    occurrenceEdited: string
    recurrenceRemoved: string
    recurrenceUpdated: string
    deleteBodyOccurrence(details: string): string
    deleteBodyOnce(details: string): string
    occurrenceDeleted: string
    deleted: string
  }
  categoryCharts: {
    expenseTitle: string
    incomeTitle: string
    noData: string
  }
  listTotal: {
    total: string
    countLabel(shown: number, monthCount: number): string
  }
  monthSwitcher: {
    previousMonth: string
    nextMonth: string
    pickMonth: string
    previousYear: string
    nextYear: string
    goToCurrentMonth: string
    monthWithData(month: string): string
  }
  summaryCards: {
    balance: string
    income: string
    expenses: string
  }
  transactionFilters: {
    kindAll: string
    kindIncome: string
    kindExpense: string
    anyCategory: string
    searchPlaceholder: string
    kindTooltip: string
    categoryTooltip: string
    resetTooltip: string
    categoriesCount(count: number): string
  }
  transactionList: {
    emptyTitle: string
    emptyDescription: string
    noMatchTitle: string
    noMatchDescription: string
  }
  transactionRow: {
    dayLabel: string
    dayValue(day: number): string
    periodLabel: string
    occurrenceLabel: string
    defaultDescription: string
    editTooltip: string
    deleteTooltip: string
  }
  mainWindow: {
    optionsMenu: string
    aboutMenu(appName: string): string
    quitMenu: string
    addTransactionTooltip: string
    added: string
    addedRecurring: string
    retryButton: string
    serverUnreachable: string
  }
}

export type IconKey =
  | 'food' | 'housing' | 'energy' | 'water' | 'heating' | 'diy' | 'transport' | 'travel'
  | 'commute' | 'leisure' | 'games' | 'music' | 'audio' | 'photo' | 'tv' | 'media'
  | 'health' | 'sport' | 'insurance' | 'income' | 'expenses' | 'accounts' | 'shopping'
  | 'spreadsheet' | 'admin' | 'mail' | 'calendar' | 'subscriptions' | 'internet' | 'phone'
  | 'computer' | 'education' | 'books' | 'family' | 'personal' | 'nature' | 'holidays'
  | 'favorite' | 'important' | 'other'

/** "1 <noun>" / "n <noun>s": the French plural, an "s" past the first. */
function frCount(count: number, noun: string): string {
  return `${count} ${noun}${count > 1 ? 's' : ''}`
}

/** Same rule in English: singular only at exactly one. */
function enCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

const fr: Strings = {
  common: {
    cancel: 'Annuler',
    delete: 'Supprimer',
    save: 'Enregistrer',
    add: 'Ajouter',
    type: 'Type',
    frequency: 'Fréquence',
    expense: 'Dépense',
    income: 'Revenu',
    noDescription: '(sans description)',
  },
  appInfo: {
    description: 'Gestion de budget personnel — revenus, dépenses et solde.',
  },
  format: {
    frequency: {
      monthly: 'Mensuelle',
      quarterly: 'Trimestrielle',
      yearly: 'Annuelle',
    },
    recurrenceFrom: (month) => `à partir de ${month}`,
    recurrenceRange: (start, end, occurrences) => `${start} → ${end} (${occurrences} fois)`,
  },
  remoteStatus: {
    localStorage: 'Stockage local — aucun serveur configuré',
    connecting: 'Connexion au serveur…',
    online: 'Connecté',
    onlineSyncedAt: (time) => `Connecté — dernière synchronisation à ${time}`,
    offline: 'Hors ligne — budget en lecture seule',
    errorDefault: 'Erreur de connexion',
  },
  icons: {
    food: 'Alimentation',
    housing: 'Logement',
    energy: 'Énergie',
    water: 'Eau',
    heating: 'Chauffage',
    diy: 'Bricolage',
    transport: 'Transport',
    travel: 'Voyage',
    commute: 'Déplacements',
    leisure: 'Loisirs',
    games: 'Jeux',
    music: 'Musique',
    audio: 'Audio',
    photo: 'Photo',
    tv: 'Télévision',
    media: 'Médias',
    health: 'Santé',
    sport: 'Sport',
    insurance: 'Assurance',
    income: 'Revenus',
    expenses: 'Charges',
    accounts: 'Comptes',
    shopping: 'Achats',
    spreadsheet: 'Tableur',
    admin: 'Administratif',
    mail: 'Courrier',
    calendar: 'Agenda',
    subscriptions: 'Abonnements',
    internet: 'Internet',
    phone: 'Téléphone',
    computer: 'Informatique',
    education: 'Éducation',
    books: 'Livres',
    family: 'Famille',
    personal: 'Personnel',
    nature: 'Nature',
    holidays: 'Vacances',
    favorite: 'Favori',
    important: 'Important',
    other: 'Autres',
  },
  categoriesGroup: {
    existingCategoriesTitle: 'Catégories existantes',
    newCategoryTitle: 'Nouvelle catégorie',
    nameFieldTitle: 'Nom',
    addTooltip: 'Ajouter',
    iconTooltip: (iconLabel) => `Icône : ${iconLabel} — cliquer pour changer`,
    alreadyExists: (name) => `La catégorie « ${name} » existe déjà`,
    added: 'Catégorie ajoutée',
    iconChanged: 'Icône modifiée',
    renamed: 'Catégorie renommée',
    deleteTooltip: 'Supprimer cette catégorie',
    mustKeepOne: 'Il faut conserver au moins une catégorie',
    deleteBody: 'Les transactions déjà enregistrées gardent cette catégorie : '
      + 'seule la liste proposée à la saisie change.',
    deleted: 'Catégorie supprimée',
  },
  categoryCombo: {
    title: 'Catégorie',
  },
  cloudGroup: {
    serverGroupTitle: 'Serveur WebDAV',
    serverGroupDescription: 'Le budget est lu et écrit sur le serveur ; les fichiers locaux n’en sont '
      + 'qu’un cache. Sans réseau, le budget reste consultable mais ne peut plus être modifié. '
      + 'Compatible Nextcloud, ownCloud et tout serveur WebDAV.',
    addressLabel: 'Adresse du serveur',
    addressTooltip: (hint) => `Par exemple ${hint}`,
    usernameLabel: 'Utilisateur',
    passwordLabel: 'Mot de passe',
    directoryLabel: 'Dossier distant',
    useServerLabel: 'Utiliser le serveur',
    useServerSubtitle: 'Désactivé, le budget reste sur cette machine',
    statusGroupTitle: 'État',
    syncButton: 'Synchroniser',
    connectButton: 'Connecter',
    forgetButton: 'Oublier',
    passwordKeptSubtitle: 'Conservé dans le trousseau du système, jamais dans les fichiers du budget',
    missingAddress: 'Renseignez l’adresse du serveur et l’utilisateur',
    keyringUnavailable: 'Trousseau indisponible — définissez BUDGET_APP_REMOTE_PASSWORD',
    noPasswordSaved: 'Aucun mot de passe enregistré pour ce compte',
    disconnected: 'Serveur déconnecté — le budget reste sur cette machine',
  },
  confirmDeleteDialog: {
    heading: (name) => `Supprimer « ${name} » ?`,
  },
  editScopeDialog: {
    heading: 'Transaction récurrente',
    bodyOccurrence: 'Appliquer la modification à cette occurrence seulement, ou à toute la série ?',
    bodySeriesOnly: 'La fréquence ne peut être modifiée que pour toute la série : '
      + 'les mois à venir suivront le nouveau rythme.',
    occurrenceOption: 'Cette occurrence',
    seriesOption: 'Toute la série',
  },
  dataGroup: {
    operationFailed: 'Opération impossible',
    exportBackupTitle: 'Exporter une sauvegarde',
    importBackupTitle: 'Importer une sauvegarde',
    exportCsvTitle: 'Exporter les transactions',
    importCsvTitle: 'Importer des transactions',
    backupExported: (description) => `Sauvegarde exportée — ${description}`,
    noTransactionsToExport: 'Aucune transaction à exporter',
    backupGroupTitle: 'Sauvegarde complète',
    backupGroupDescription: 'Un fichier JSON contenant les catégories, les seuils, '
      + 'les récurrences et tous les mois de l’historique.',
    exportBackupSubtitle: 'Enregistrer l’état actuel dans un fichier',
    exportButton: 'Exporter…',
    importBackupSubtitle: 'Restaurer un fichier, en remplaçant ou en fusionnant',
    importButton: 'Importer…',
    csvGroupTitle: 'Tableur (CSV)',
    csvGroupDescription: 'Colonnes date, description, catégorie, type et montant, '
      + 'séparées par des points-virgules — lisibles dans Excel ou LibreOffice.',
    exportCsvSubtitle: 'Tous les mois, du plus ancien au plus récent',
    importCsvSubtitle: 'Chaque ligne rejoint le mois de sa date et s’ajoute aux transactions existantes',
    backupFilterName: 'Sauvegarde Budget',
    csvFilterName: 'Fichier CSV',
    monthsCount: (count) => `${count} mois`,
    transactionsCount: (count) => frCount(count, 'transaction'),
    categoriesCount: (count) => frCount(count, 'catégorie'),
    recurrencesCount: (count) => frCount(count, 'récurrence'),
    transactionsExportedCount: (count) => `${frCount(count, 'transaction')} exportée${count > 1 ? 's' : ''}`,
    transactionsImportedCount: (count) => `${frCount(count, 'transaction')} importée${count > 1 ? 's' : ''}`,
    categoriesCreatedCount: (count) => `${frCount(count, 'catégorie')} créée${count > 1 ? 's' : ''}`,
    linesIgnoredCount: (count) => `${frCount(count, 'ligne')} ignorée${count > 1 ? 's' : ''}`,
    restored: (description) => `Sauvegarde restaurée — ${description}`,
    nothingToAdd: 'Rien à ajouter : ces données sont déjà présentes',
    mergeCompleted: (parts) => `Fusion terminée — ajout de ${parts}`,
    csvImportSummary: (imported, monthsLabel) => `${imported} dans ${monthsLabel}`,
  },
  importModeDialog: {
    heading: 'Importer la sauvegarde',
    body: (summary) => `Cette sauvegarde contient ${summary}.\n\n`
      + 'Fusionner ajoute seulement ce qui manque et conserve les données actuelles. '
      + 'Remplacer efface les données actuelles — mois, catégories, seuils et récurrences — '
      + 'au profit de celles du fichier.',
    mergeOption: 'Fusionner',
    replaceOption: 'Remplacer',
  },
  iconPickerDialog: {
    title: 'Choisir une icône',
  },
  occurrenceCountField: {
    limitedTitle: 'Durée limitée',
    limitedSubtitle: 'Sinon la série se répète sans fin',
    countTitle: 'Nombre d’occurrences',
  },
  optionsDialog: {
    title: 'Options',
    thresholdsTab: 'Seuils',
    recurrencesTab: 'Récurrences',
    categoriesTab: 'Catégories',
    dataTab: 'Données',
    cloudTab: 'Cloud',
  },
  recurrenceDialog: {
    defaultDescription: (kind) => (kind === 'income' ? 'Revenu récurrent' : 'Dépense récurrente'),
    transactionGroupTitle: 'Transaction générée',
    typeRow: 'Type',
    descriptionLabel: 'Description',
    amountLabel: 'Montant (€)',
    rhythmGroupTitle: 'Rythme',
    rhythmGroupDescription: 'La transaction est créée automatiquement à l’ouverture de chaque mois concerné.',
    dayLabel: 'Jour du mois',
    daySubtitle: 'Ramené au dernier jour des mois plus courts',
    startMonthLabel: 'Mois de départ',
    startYearLabel: 'Année de départ',
    startYearSubtitle: 'Aucune occurrence avant ce mois',
    editTitle: 'Modifier la récurrence',
    newTitle: 'Nouvelle récurrence',
  },
  recurrencesGroup: {
    groupTitle: 'Transactions récurrentes',
    groupDescription: 'Chaque récurrence est ajoutée automatiquement aux mois concernés, '
      + 'dès leur ouverture.',
    dayPrefix: (day) => `le ${day}`,
    editTooltip: 'Modifier cette récurrence',
    deleteTooltip: 'Supprimer cette récurrence',
    updated: 'Récurrence modifiée',
    deleteBody: 'Les transactions déjà ajoutées aux mois ouverts sont conservées : '
      + 'seules les prochaines ne seront plus créées.',
    deleted: 'Récurrence supprimée — les transactions déjà créées sont conservées',
    addTooltip: 'Ajouter une récurrence',
    added: 'Récurrence ajoutée',
    emptyTitle: 'Aucune récurrence',
    emptySubtitle: 'Loyer, salaire, abonnement… ajoutez-en une avec le bouton +',
  },
  thresholdsGroup: {
    groupTitle: 'Seuils du solde',
    groupDescription: (rule) => 'Couleur de fond du solde : rouge en dessous de x, orange de x à y, '
      + `jaune de y à z, vert à partir de z. Les seuils doivent respecter ${rule}.`,
    lowLabel: 'Seuil rouge',
    mediumLabel: 'Seuil orange',
    highLabel: 'Seuil jaune',
    orderError: (rule) => `Les seuils doivent respecter ${rule}`,
    saved: 'Seuils enregistrés',
    saveButton: 'Enregistrer',
  },
  transactionDialog: {
    defaultDescription: (kind) => (kind === 'income' ? 'Revenu' : 'Dépense'),
    typeRow: 'Type',
    amountLabel: 'Montant (€)',
    onceLabel: 'Ponctuelle',
    repeatGroupTitle: 'Répétition',
    repeatGroupDescription: 'Une transaction répétée est recréée automatiquement, le même jour, '
      + 'dans chaque mois concerné, dès son ouverture.',
    editTitle: 'Modifier la transaction',
    newTitle: 'Nouvelle transaction',
  },
  budgetView: {
    edited: 'Transaction modifiée',
    editedRecurring: 'Transaction modifiée et rendue récurrente',
    occurrenceEdited: 'Occurrence modifiée — la récurrence est inchangée',
    recurrenceRemoved: 'Récurrence supprimée — la transaction devient ponctuelle',
    recurrenceUpdated: 'Récurrence mise à jour',
    deleteBodyOccurrence: (details) => `${details}\n\nCette transaction vient d’une récurrence : elle réapparaîtra `
      + 'à la prochaine ouverture du mois. Pour qu’elle cesse d’être créée, '
      + 'supprimez plutôt la récurrence dans les options.',
    deleteBodyOnce: (details) => `${details}\n\nElle sera retirée du mois définitivement.`,
    occurrenceDeleted: 'Occurrence supprimée — elle réapparaîtra à la prochaine ouverture du mois',
    deleted: 'Transaction supprimée',
  },
  categoryCharts: {
    expenseTitle: 'Dépenses par catégorie',
    incomeTitle: 'Revenus par catégorie',
    noData: 'Aucune donnée',
  },
  listTotal: {
    total: 'Total',
    countLabel: (shown, monthCount) => (shown === monthCount
      ? frCount(shown, 'transaction')
      : `${frCount(shown, 'transaction')} sur ${monthCount}`),
  },
  monthSwitcher: {
    previousMonth: 'Mois précédent',
    nextMonth: 'Mois suivant',
    pickMonth: 'Choisir un mois',
    previousYear: 'Année précédente',
    nextYear: 'Année suivante',
    goToCurrentMonth: 'Aller au mois courant',
    monthWithData: (month) => `${month} — contient des transactions`,
  },
  summaryCards: {
    balance: 'Solde',
    income: 'Revenus',
    expenses: 'Dépenses',
  },
  transactionFilters: {
    kindAll: 'Tous',
    kindIncome: 'Revenus',
    kindExpense: 'Dépenses',
    anyCategory: 'Toutes',
    searchPlaceholder: 'Rechercher une description ou une catégorie…',
    kindTooltip: 'N’afficher qu’un type de transaction',
    categoryTooltip: 'N’afficher que certaines catégories',
    resetTooltip: 'Réinitialiser les filtres',
    categoriesCount: (count) => `${count} catégories`,
  },
  transactionList: {
    emptyTitle: 'Aucune transaction',
    emptyDescription: 'Cliquez sur « + » pour ajouter un revenu ou une dépense à ce mois.',
    noMatchTitle: 'Aucun résultat',
    noMatchDescription: 'Ce mois contient des transactions, mais aucune ne correspond au filtre.',
  },
  transactionRow: {
    dayLabel: 'Jour',
    dayValue: (day) => `le ${day} du mois`,
    periodLabel: 'Période',
    occurrenceLabel: 'Cette occurrence',
    defaultDescription: 'Transaction récurrente',
    editTooltip: 'Modifier cette transaction',
    deleteTooltip: 'Supprimer cette transaction',
  },
  mainWindow: {
    optionsMenu: 'Options',
    aboutMenu: (appName) => `À propos de ${appName}`,
    quitMenu: 'Quitter',
    addTransactionTooltip: 'Ajouter une transaction',
    added: 'Transaction ajoutée',
    addedRecurring: 'Transaction récurrente ajoutée',
    retryButton: 'Réessayer',
    serverUnreachable: 'Serveur inaccessible — budget en lecture seule',
  },
}

const en: Strings = {
  common: {
    cancel: 'Cancel',
    delete: 'Delete',
    save: 'Save',
    add: 'Add',
    type: 'Type',
    frequency: 'Frequency',
    expense: 'Expense',
    income: 'Income',
    noDescription: '(no description)',
  },
  appInfo: {
    description: 'Personal budget management — income, expenses and balance.',
  },
  format: {
    frequency: {
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      yearly: 'Yearly',
    },
    recurrenceFrom: (month) => `starting ${month}`,
    recurrenceRange: (start, end, occurrences) => `${start} → ${end} (${occurrences} times)`,
  },
  remoteStatus: {
    localStorage: 'Local storage — no server configured',
    connecting: 'Connecting to the server…',
    online: 'Connected',
    onlineSyncedAt: (time) => `Connected — last synced at ${time}`,
    offline: 'Offline — read-only budget',
    errorDefault: 'Connection error',
  },
  icons: {
    food: 'Food',
    housing: 'Housing',
    energy: 'Energy',
    water: 'Water',
    heating: 'Heating',
    diy: 'DIY',
    transport: 'Transport',
    travel: 'Travel',
    commute: 'Commuting',
    leisure: 'Leisure',
    games: 'Games',
    music: 'Music',
    audio: 'Audio',
    photo: 'Photo',
    tv: 'TV',
    media: 'Media',
    health: 'Health',
    sport: 'Sport',
    insurance: 'Insurance',
    income: 'Income',
    expenses: 'Expenses',
    accounts: 'Accounts',
    shopping: 'Shopping',
    spreadsheet: 'Spreadsheet',
    admin: 'Admin',
    mail: 'Mail',
    calendar: 'Calendar',
    subscriptions: 'Subscriptions',
    internet: 'Internet',
    phone: 'Phone',
    computer: 'Computer',
    education: 'Education',
    books: 'Books',
    family: 'Family',
    personal: 'Personal',
    nature: 'Nature',
    holidays: 'Holidays',
    favorite: 'Favorite',
    important: 'Important',
    other: 'Other',
  },
  categoriesGroup: {
    existingCategoriesTitle: 'Existing categories',
    newCategoryTitle: 'New category',
    nameFieldTitle: 'Name',
    addTooltip: 'Add',
    iconTooltip: (iconLabel) => `Icon: ${iconLabel} — click to change`,
    alreadyExists: (name) => `The category "${name}" already exists`,
    added: 'Category added',
    iconChanged: 'Icon changed',
    renamed: 'Category renamed',
    deleteTooltip: 'Delete this category',
    mustKeepOne: 'At least one category must remain',
    deleteBody: 'Transactions already recorded keep this category: '
      + 'only the list offered when entering one changes.',
    deleted: 'Category deleted',
  },
  categoryCombo: {
    title: 'Category',
  },
  cloudGroup: {
    serverGroupTitle: 'WebDAV server',
    serverGroupDescription: 'The budget is read from and written to the server; the local files are only '
      + 'a cache. Without a network, the budget stays readable but can no longer be edited. '
      + 'Compatible with Nextcloud, ownCloud and any WebDAV server.',
    addressLabel: 'Server address',
    addressTooltip: (hint) => `For example ${hint}`,
    usernameLabel: 'Username',
    passwordLabel: 'Password',
    directoryLabel: 'Remote folder',
    useServerLabel: 'Use the server',
    useServerSubtitle: 'When off, the budget stays on this machine',
    statusGroupTitle: 'Status',
    syncButton: 'Sync',
    connectButton: 'Connect',
    forgetButton: 'Forget',
    passwordKeptSubtitle: 'Kept in the system keyring, never in the budget files',
    missingAddress: 'Enter the server address and username',
    keyringUnavailable: 'Keyring unavailable — set BUDGET_APP_REMOTE_PASSWORD',
    noPasswordSaved: 'No password saved for this account',
    disconnected: 'Server disconnected — the budget stays on this machine',
  },
  confirmDeleteDialog: {
    heading: (name) => `Delete "${name}"?`,
  },
  editScopeDialog: {
    heading: 'Recurring transaction',
    bodyOccurrence: 'Apply the change to this occurrence only, or to the whole series?',
    bodySeriesOnly: 'The frequency can only be changed for the whole series: '
      + 'upcoming months will follow the new rhythm.',
    occurrenceOption: 'This occurrence',
    seriesOption: 'Whole series',
  },
  dataGroup: {
    operationFailed: 'Operation failed',
    exportBackupTitle: 'Export a backup',
    importBackupTitle: 'Import a backup',
    exportCsvTitle: 'Export the transactions',
    importCsvTitle: 'Import transactions',
    backupExported: (description) => `Backup exported — ${description}`,
    noTransactionsToExport: 'No transactions to export',
    backupGroupTitle: 'Full backup',
    backupGroupDescription: 'A JSON file containing the categories, the thresholds, '
      + 'the recurrences and the whole history of months.',
    exportBackupSubtitle: 'Save the current state to a file',
    exportButton: 'Export…',
    importBackupSubtitle: 'Restore a file, replacing or merging',
    importButton: 'Import…',
    csvGroupTitle: 'Spreadsheet (CSV)',
    csvGroupDescription: 'Date, description, category, type and amount columns, '
      + 'separated by semicolons — readable in Excel or LibreOffice.',
    exportCsvSubtitle: 'Every month, oldest to newest',
    importCsvSubtitle: 'Each row joins the month of its date and is added to the existing transactions',
    backupFilterName: 'Budget backup',
    csvFilterName: 'CSV file',
    monthsCount: (count) => enCount(count, 'month'),
    transactionsCount: (count) => enCount(count, 'transaction'),
    categoriesCount: (count) => enCount(count, 'category', 'categories'),
    recurrencesCount: (count) => enCount(count, 'recurrence'),
    transactionsExportedCount: (count) => `${enCount(count, 'transaction')} exported`,
    transactionsImportedCount: (count) => `${enCount(count, 'transaction')} imported`,
    categoriesCreatedCount: (count) => `${enCount(count, 'category', 'categories')} created`,
    linesIgnoredCount: (count) => `${enCount(count, 'line')} ignored`,
    restored: (description) => `Backup restored — ${description}`,
    nothingToAdd: 'Nothing to add: this data is already present',
    mergeCompleted: (parts) => `Merge complete — added ${parts}`,
    csvImportSummary: (imported, monthsLabel) => `${imported} across ${monthsLabel}`,
  },
  importModeDialog: {
    heading: 'Import the backup',
    body: (summary) => `This backup contains ${summary}.\n\n`
      + 'Merging only adds what is missing and keeps the current data. '
      + 'Replacing erases the current data — months, categories, thresholds and recurrences — '
      + 'in favour of the file\'s.',
    mergeOption: 'Merge',
    replaceOption: 'Replace',
  },
  iconPickerDialog: {
    title: 'Choose an icon',
  },
  occurrenceCountField: {
    limitedTitle: 'Limited length',
    limitedSubtitle: 'Otherwise the series repeats forever',
    countTitle: 'Number of occurrences',
  },
  optionsDialog: {
    title: 'Options',
    thresholdsTab: 'Thresholds',
    recurrencesTab: 'Recurrences',
    categoriesTab: 'Categories',
    dataTab: 'Data',
    cloudTab: 'Cloud',
  },
  recurrenceDialog: {
    defaultDescription: (kind) => (kind === 'income' ? 'Recurring income' : 'Recurring expense'),
    transactionGroupTitle: 'Generated transaction',
    typeRow: 'Type',
    descriptionLabel: 'Description',
    amountLabel: 'Amount (€)',
    rhythmGroupTitle: 'Rhythm',
    rhythmGroupDescription: 'The transaction is created automatically when each concerned month opens.',
    dayLabel: 'Day of the month',
    daySubtitle: 'Clamped to the last day of shorter months',
    startMonthLabel: 'Starting month',
    startYearLabel: 'Starting year',
    startYearSubtitle: 'No occurrence before this month',
    editTitle: 'Edit the recurrence',
    newTitle: 'New recurrence',
  },
  recurrencesGroup: {
    groupTitle: 'Recurring transactions',
    groupDescription: 'Each recurrence is automatically added to the months it concerns, '
      + 'as soon as they open.',
    dayPrefix: (day) => `day ${day}`,
    editTooltip: 'Edit this recurrence',
    deleteTooltip: 'Delete this recurrence',
    updated: 'Recurrence updated',
    deleteBody: 'Transactions already added to opened months are kept: '
      + 'only the upcoming ones will no longer be created.',
    deleted: 'Recurrence deleted — transactions already created are kept',
    addTooltip: 'Add a recurrence',
    added: 'Recurrence added',
    emptyTitle: 'No recurrence',
    emptySubtitle: 'Rent, salary, subscription… add one with the + button',
  },
  thresholdsGroup: {
    groupTitle: 'Balance thresholds',
    groupDescription: (rule) => 'Balance background colour: red below x, orange from x to y, '
      + `yellow from y to z, green from z onward. The thresholds must respect ${rule}.`,
    lowLabel: 'Red threshold',
    mediumLabel: 'Orange threshold',
    highLabel: 'Yellow threshold',
    orderError: (rule) => `The thresholds must respect ${rule}`,
    saved: 'Thresholds saved',
    saveButton: 'Save',
  },
  transactionDialog: {
    defaultDescription: (kind) => (kind === 'income' ? 'Income' : 'Expense'),
    typeRow: 'Type',
    amountLabel: 'Amount (€)',
    onceLabel: 'One-off',
    repeatGroupTitle: 'Repetition',
    repeatGroupDescription: 'A repeated transaction is recreated automatically, on the same day, '
      + 'in every concerned month, as soon as it opens.',
    editTitle: 'Edit the transaction',
    newTitle: 'New transaction',
  },
  budgetView: {
    edited: 'Transaction updated',
    editedRecurring: 'Transaction updated and made recurring',
    occurrenceEdited: 'Occurrence updated — the recurrence is unchanged',
    recurrenceRemoved: 'Recurrence removed — the transaction becomes one-off',
    recurrenceUpdated: 'Recurrence updated',
    deleteBodyOccurrence: (details) => `${details}\n\nThis transaction comes from a recurrence: it will reappear `
      + 'the next time the month opens. To stop it from being created, '
      + 'delete the recurrence in the options instead.',
    deleteBodyOnce: (details) => `${details}\n\nIt will be removed from the month for good.`,
    occurrenceDeleted: 'Occurrence deleted — it will reappear the next time the month opens',
    deleted: 'Transaction deleted',
  },
  categoryCharts: {
    expenseTitle: 'Expenses by category',
    incomeTitle: 'Income by category',
    noData: 'No data',
  },
  listTotal: {
    total: 'Total',
    countLabel: (shown, monthCount) => (shown === monthCount
      ? enCount(shown, 'transaction')
      : `${enCount(shown, 'transaction')} out of ${monthCount}`),
  },
  monthSwitcher: {
    previousMonth: 'Previous month',
    nextMonth: 'Next month',
    pickMonth: 'Pick a month',
    previousYear: 'Previous year',
    nextYear: 'Next year',
    goToCurrentMonth: 'Go to current month',
    monthWithData: (month) => `${month} — has transactions`,
  },
  summaryCards: {
    balance: 'Balance',
    income: 'Income',
    expenses: 'Expenses',
  },
  transactionFilters: {
    kindAll: 'All',
    kindIncome: 'Income',
    kindExpense: 'Expenses',
    anyCategory: 'All',
    searchPlaceholder: 'Search a description or category…',
    kindTooltip: 'Show only one transaction type',
    categoryTooltip: 'Show only some categories',
    resetTooltip: 'Reset the filters',
    categoriesCount: (count) => enCount(count, 'category', 'categories'),
  },
  transactionList: {
    emptyTitle: 'No transactions',
    emptyDescription: 'Click "+" to add an income or an expense to this month.',
    noMatchTitle: 'No results',
    noMatchDescription: 'This month has transactions, but none match the filter.',
  },
  transactionRow: {
    dayLabel: 'Day',
    dayValue: (day) => `the ${day} of the month`,
    periodLabel: 'Period',
    occurrenceLabel: 'This occurrence',
    defaultDescription: 'Recurring transaction',
    editTooltip: 'Edit this transaction',
    deleteTooltip: 'Delete this transaction',
  },
  mainWindow: {
    optionsMenu: 'Options',
    aboutMenu: (appName) => `About ${appName}`,
    quitMenu: 'Quit',
    addTransactionTooltip: 'Add a transaction',
    added: 'Transaction added',
    addedRecurring: 'Recurring transaction added',
    retryButton: 'Retry',
    serverUnreachable: 'Server unreachable — read-only budget',
  },
}

const DICTIONARIES = { fr, en }

/** The strings for the language the app currently runs in. */
export function t(): Strings {
  return DICTIONARIES[getLocale()]
}
