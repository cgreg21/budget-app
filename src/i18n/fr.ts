import type { Strings } from './strings.js'

/** "1 <noun>" / "n <noun>s": the French plural, an "s" past the first. */
function frCount(count: number, noun: string): string {
  return `${count} ${noun}${count > 1 ? 's' : ''}`
}

export const fr: Strings = {
  common: {
    cancel: 'Annuler', delete: 'Supprimer', save: 'Enregistrer', add: 'Ajouter', type: 'Type',
    frequency: 'Fréquence', expense: 'Dépense', income: 'Revenu', noDescription: '(sans description)',
  },
  appInfo: { description: 'Gestion de budget personnel — revenus, dépenses et solde.' },
  format: {
    frequency: { monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' },
    recurrenceFrom: (month) => `à partir de ${month}`,
    recurrenceRange: (start, end, occurrences) => `${start} → ${end} (${occurrences} fois)`,
  },
  remoteStatus: {
    localStorage: 'Stockage local — aucun serveur configuré', connecting: 'Connexion au serveur…', online: 'Connecté',
    onlineSyncedAt: (time) => `Connecté — dernière synchronisation à ${time}`,
    offline: 'Hors ligne — budget en lecture seule', errorDefault: 'Erreur de connexion',
  },
  icons: {
    food: 'Alimentation', housing: 'Logement', energy: 'Énergie', water: 'Eau', heating: 'Chauffage', diy: 'Bricolage',
    transport: 'Transport', travel: 'Voyage', commute: 'Déplacements', leisure: 'Loisirs', games: 'Jeux', music: 'Musique',
    audio: 'Audio', photo: 'Photo', tv: 'Télévision', media: 'Médias', health: 'Santé', sport: 'Sport', insurance: 'Assurance',
    income: 'Revenus', expenses: 'Charges', accounts: 'Comptes', shopping: 'Achats', spreadsheet: 'Tableur', admin: 'Administratif',
    mail: 'Courrier', calendar: 'Agenda', subscriptions: 'Abonnements', internet: 'Internet', phone: 'Téléphone', computer: 'Informatique',
    education: 'Éducation', books: 'Livres', family: 'Famille', personal: 'Personnel', nature: 'Nature', holidays: 'Vacances',
    favorite: 'Favori', important: 'Important', other: 'Autres',
  },
  categoriesGroup: {
    existingCategoriesTitle: 'Catégories existantes', newCategoryTitle: 'Nouvelle catégorie', nameFieldTitle: 'Nom', addTooltip: 'Ajouter',
    iconTooltip: (iconLabel) => `Icône : ${iconLabel} — cliquer pour changer`,
    alreadyExists: (name) => `La catégorie « ${name} » existe déjà`, added: 'Catégorie ajoutée', iconChanged: 'Icône modifiée', renamed: 'Catégorie renommée',
    deleteTooltip: 'Supprimer cette catégorie', mustKeepOne: 'Il faut conserver au moins une catégorie',
    deleteBody: 'Les transactions déjà enregistrées gardent cette catégorie : ' + 'seule la liste proposée à la saisie change.',
    deleted: 'Catégorie supprimée',
  },
  categoryCombo: { title: 'Catégorie' },
  cloudGroup: {
    serverGroupTitle: 'Serveur WebDAV',
    serverGroupDescription: 'Le budget est lu et écrit sur le serveur ; les fichiers locaux n’en sont ' + 'qu’un cache. Sans réseau, le budget reste consultable mais ne peut plus être modifié. ' + 'Compatible Nextcloud, ownCloud et tout serveur WebDAV.',
    addressLabel: 'Adresse du serveur', addressTooltip: (hint) => `Par exemple ${hint}`, usernameLabel: 'Utilisateur', passwordLabel: 'Mot de passe', directoryLabel: 'Dossier distant',
    useServerLabel: 'Utiliser le serveur', useServerSubtitle: 'Désactivé, le budget reste sur cette machine', statusGroupTitle: 'État', syncButton: 'Synchroniser', connectButton: 'Connecter', forgetButton: 'Oublier',
    passwordKeptSubtitle: 'Conservé dans le trousseau du système, jamais dans les fichiers du budget', missingAddress: 'Renseignez l’adresse du serveur et l’utilisateur',
    keyringUnavailable: 'Trousseau indisponible — définissez BUDGET_APP_REMOTE_PASSWORD', noPasswordSaved: 'Aucun mot de passe enregistré pour ce compte', disconnected: 'Serveur déconnecté — le budget reste sur cette machine',
  },
  confirmDeleteDialog: { heading: (name) => `Supprimer « ${name} » ?` },
  editScopeDialog: {
    heading: 'Transaction récurrente', bodyOccurrence: 'Appliquer la modification à cette occurrence seulement, ou à toute la série ?',
    bodySeriesOnly: 'La fréquence ne peut être modifiée que pour toute la série : ' + 'les mois à venir suivront le nouveau rythme.', occurrenceOption: 'Cette occurrence', seriesOption: 'Toute la série',
  },
  dataGroup: {
    operationFailed: 'Opération impossible', exportBackupTitle: 'Exporter une sauvegarde', importBackupTitle: 'Importer une sauvegarde', exportCsvTitle: 'Exporter les transactions', importCsvTitle: 'Importer des transactions',
    backupExported: (description) => `Sauvegarde exportée — ${description}`, noTransactionsToExport: 'Aucune transaction à exporter', backupGroupTitle: 'Sauvegarde complète',
    backupGroupDescription: 'Un fichier JSON contenant les catégories, les seuils, ' + 'les récurrences et tous les mois de l’historique.', exportBackupSubtitle: 'Enregistrer l’état actuel dans un fichier', exportButton: 'Exporter…', importBackupSubtitle: 'Restaurer un fichier, en remplaçant ou en fusionnant', importButton: 'Importer…',
    csvGroupTitle: 'Tableur (CSV)', csvGroupDescription: 'Colonnes date, description, catégorie, type et montant, ' + 'séparées par des points-virgules — lisibles dans Excel ou LibreOffice.', exportCsvSubtitle: 'Tous les mois, du plus ancien au plus récent', importCsvSubtitle: 'Chaque ligne rejoint le mois de sa date et s’ajoute aux transactions existantes', backupFilterName: 'Sauvegarde Budget', csvFilterName: 'Fichier CSV',
    monthsCount: (count) => `${count} mois`, transactionsCount: (count) => frCount(count, 'transaction'), categoriesCount: (count) => frCount(count, 'catégorie'), recurrencesCount: (count) => frCount(count, 'récurrence'),
    transactionsExportedCount: (count) => `${frCount(count, 'transaction')} exportée${count > 1 ? 's' : ''}`, transactionsImportedCount: (count) => `${frCount(count, 'transaction')} importée${count > 1 ? 's' : ''}`, categoriesCreatedCount: (count) => `${frCount(count, 'catégorie')} créée${count > 1 ? 's' : ''}`, linesIgnoredCount: (count) => `${frCount(count, 'ligne')} ignorée${count > 1 ? 's' : ''}`,
    restored: (description) => `Sauvegarde restaurée — ${description}`, nothingToAdd: 'Rien à ajouter : ces données sont déjà présentes', mergeCompleted: (parts) => `Fusion terminée — ajout de ${parts}`, csvImportSummary: (imported, monthsLabel) => `${imported} dans ${monthsLabel}`,
  },
  importModeDialog: { heading: 'Importer la sauvegarde', body: (summary) => `Cette sauvegarde contient ${summary}.\n\n` + 'Fusionner ajoute seulement ce qui manque et conserve les données actuelles. ' + 'Remplacer efface les données actuelles — mois, catégories, seuils et récurrences — ' + 'au profit de celles du fichier.', mergeOption: 'Fusionner', replaceOption: 'Remplacer' },
  iconPickerDialog: { title: 'Choisir une icône' },
  occurrenceCountField: { limitedTitle: 'Durée limitée', limitedSubtitle: 'Sinon la série se répète sans fin', countTitle: 'Nombre d’occurrences' },
  generalSettings: {
    groupTitle: 'Préférences générales', groupDescription: 'Choisissez la langue, les formats et le thème de l’application.',
    languageTitle: 'Langue', languageFrench: 'Français', languageEnglish: 'English', currencyTitle: 'Devise',
    dateFormatTitle: 'Format de date', dateLocale: 'Selon la langue', amountFormatTitle: 'Format des montants',
    amountLocale: 'Selon la langue', themeTitle: 'Thème', themeSystem: 'Système', themeLight: 'Clair', themeDark: 'Sombre',
    saveButton: 'Enregistrer', saved: 'Préférences enregistrées',
  },
  optionsDialog: { title: 'Options', generalTab: 'Général', thresholdsTab: 'Seuils', recurrencesTab: 'Récurrences', categoriesTab: 'Catégories', dataTab: 'Données', cloudTab: 'Cloud' },
  recurrenceDialog: {
    defaultDescription: (kind) => (kind === 'income' ? 'Revenu récurrent' : 'Dépense récurrente'), transactionGroupTitle: 'Transaction générée', typeRow: 'Type', descriptionLabel: 'Description', amountLabel: 'Montant (€)', rhythmGroupTitle: 'Rythme', rhythmGroupDescription: 'La transaction est créée automatiquement à l’ouverture de chaque mois concerné.', dayLabel: 'Jour du mois', daySubtitle: 'Ramené au dernier jour des mois plus courts', startMonthLabel: 'Mois de départ', startYearLabel: 'Année de départ', startYearSubtitle: 'Aucune occurrence avant ce mois', editTitle: 'Modifier la récurrence', newTitle: 'Nouvelle récurrence',
  },
  recurrencesGroup: {
    groupTitle: 'Transactions récurrentes', groupDescription: 'Chaque récurrence est ajoutée automatiquement aux mois concernés, ' + 'dès leur ouverture.', dayPrefix: (day) => `le ${day}`, editTooltip: 'Modifier cette récurrence', deleteTooltip: 'Supprimer cette récurrence', updated: 'Récurrence modifiée', deleteBody: 'Les transactions déjà ajoutées aux mois ouverts sont conservées : ' + 'seules les prochaines ne seront plus créées.', deleted: 'Récurrence supprimée — les transactions déjà créées sont conservées', addTooltip: 'Ajouter une récurrence', added: 'Récurrence ajoutée', emptyTitle: 'Aucune récurrence', emptySubtitle: 'Loyer, salaire, abonnement… ajoutez-en une avec le bouton +',
  },
  thresholdsGroup: { groupTitle: 'Seuils du solde', groupDescription: (rule) => 'Couleur de fond du solde : rouge en dessous de x, orange de x à y, ' + `jaune de y à z, vert à partir de z. Les seuils doivent respecter ${rule}.`, lowLabel: 'Seuil rouge', mediumLabel: 'Seuil orange', highLabel: 'Seuil jaune', orderError: (rule) => `Les seuils doivent respecter ${rule}`, saved: 'Seuils enregistrés', saveButton: 'Enregistrer' },
  transactionDialog: { defaultDescription: (kind) => (kind === 'income' ? 'Revenu' : 'Dépense'), typeRow: 'Type', amountLabel: 'Montant (€)', onceLabel: 'Ponctuelle', repeatGroupTitle: 'Répétition', repeatGroupDescription: 'Une transaction répétée est recréée automatiquement, le même jour, ' + 'dans chaque mois concerné, dès son ouverture.', editTitle: 'Modifier la transaction', newTitle: 'Nouvelle transaction' },
  budgetView: { edited: 'Transaction modifiée', editedRecurring: 'Transaction modifiée et rendue récurrente', occurrenceEdited: 'Occurrence modifiée — la récurrence est inchangée', recurrenceRemoved: 'Récurrence supprimée — la transaction devient ponctuelle', recurrenceUpdated: 'Récurrence mise à jour', deleteBodyOccurrence: (details) => `${details}\n\nCette transaction vient d’une récurrence : elle réapparaîtra ` + 'à la prochaine ouverture du mois. Pour qu’elle cesse d’être créée, ' + 'supprimez plutôt la récurrence dans les options.', deleteBodyOnce: (details) => `${details}\n\nElle sera retirée du mois définitivement.`, occurrenceDeleted: 'Occurrence supprimée — elle réapparaîtra à la prochaine ouverture du mois', deleted: 'Transaction supprimée', tabRecurring: 'Récurrent', tabOther: 'Autres', tabCharts: 'Graphique' },
  categoryCharts: { recurringExpenseTitle: 'Dépenses récurrentes par catégorie', otherExpenseTitle: 'Autres dépenses par catégorie', noData: 'Aucune donnée', legendTooltip: 'Afficher la légende', sliceDetails: (category, amount, percent) => `${category} : ${amount} (${percent})` },
  listTotal: { total: 'Total', countLabel: (shown, monthCount) => (shown === monthCount ? frCount(shown, 'transaction') : `${frCount(shown, 'transaction')} sur ${monthCount}`) },
  monthSwitcher: { previousMonth: 'Mois précédent', nextMonth: 'Mois suivant', pickMonth: 'Choisir un mois', previousYear: 'Année précédente', nextYear: 'Année suivante', goToCurrentMonth: 'Aller au mois courant', monthWithData: (month) => `${month} — contient des transactions` },
  summaryCards: { balance: 'Solde', income: 'Revenus', expenses: 'Dépenses' },
  transactionFilters: { kindAll: 'Tous', kindIncome: 'Revenus', kindExpense: 'Dépenses', anyCategory: 'Toutes', searchPlaceholder: 'Rechercher une description ou une catégorie…', kindTooltip: 'N’afficher qu’un type de transaction', categoryTooltip: 'N’afficher que certaines catégories', resetTooltip: 'Réinitialiser les filtres', categoriesCount: (count) => `${count} catégories` },
  transactionList: { recurringTitle: 'Transactions récurrentes', otherTitle: 'Autres transactions', emptyTitle: 'Aucune transaction', emptyDescription: 'Cliquez sur « + » pour ajouter un revenu ou une dépense à ce mois.', noMatchTitle: 'Aucun résultat', noMatchDescription: 'Ce mois contient des transactions, mais aucune ne correspond au filtre.' },
  transactionRow: { dayLabel: 'Jour', dayValue: (day) => `le ${day} du mois`, periodLabel: 'Période', occurrenceLabel: 'Cette occurrence', defaultDescription: 'Transaction récurrente', editTooltip: 'Modifier cette transaction', deleteTooltip: 'Supprimer cette transaction' },
  mainWindow: { optionsMenu: 'Options', aboutMenu: (appName) => `À propos de ${appName}`, quitMenu: 'Quitter', addTransactionTooltip: 'Ajouter une transaction', added: 'Transaction ajoutée', addedRecurring: 'Transaction récurrente ajoutée', retryButton: 'Réessayer', serverUnreachable: 'Serveur inaccessible — budget en lecture seule', historyMenu: 'Historique', budgetMenu: 'Budget' },
  historyView: { title: 'Historique mensuel', description: 'Revenus et dépenses mois par mois.', income: 'Revenus', expenses: 'Dépenses', noData: 'Aucune donnée historique' },
}
