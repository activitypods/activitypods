import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import React, { useCallback, useEffect, useState } from 'react';
import { dashboardApi } from './dashboardApi';

type LdpResource = { '@id': string };

type FilterAction = 'hide' | 'warn' | 'filter';
type FilterMatchType = 'word' | 'phrase';
type FilterDuration = 'indefinite' | '12h' | '1d' | '1w' | '1m';
type SubjectProtocol = 'ap' | 'atproto';

type KeywordFilter = LdpResource & {
  pattern: string;
  terms?: string[];
  action: FilterAction;
  matchType?: FilterMatchType;
  duration?: FilterDuration;
  expiresAt?: string;
  includeHashtagVariants?: boolean;
};

type Preference = LdpResource & {
  category: string;
  value?: any;
};

type MonthlyModerationSummary = {
  generatedAt: string;
  period: { start: string; end: string };
  deliveryEnabled: boolean;
  filters: {
    total: number;
    active: number;
    actions: { hide: number; warn: number; filter: number };
  };
  mutes: { total: number };
  blocks: { total: number };
  sensitiveContent: { mediaDisplayMode: string };
};

type AtprotoListPreview = {
  pdsUrl: string;
  did?: string;
  handle?: string;
  mutes: Array<{ did?: string; handle?: string }>;
  blocks: Array<{ did?: string; handle?: string }>;
  fetchedAt: string;
};

type AtprotoSyncConfig = {
  enabled: boolean;
  replace: boolean;
  intervalHours: number;
  pdsUrl: string | null;
  identifier: string | null;
  hasStoredSecret: boolean;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

type AtprotoLabelerCatalogEntry = {
  resourceUri: string | null;
  source: string;
  sourceType: 'atproto-labeler';
  name: string;
  description?: string | null;
  scopes: string[];
  enabled: boolean;
  installed: boolean;
  recommended: boolean;
  immutable: boolean;
  handle?: string | null;
  did?: string | null;
  syncOrigin?: string | null;
  priority?: number;
  weight?: number;
  directorySource?: string | null;
  directoryRank?: number;
};

type AtprotoHandleResolution = {
  did?: string;
  handle?: string;
  pdsUrl?: string;
};

type MutedAccount = LdpResource & {
  subjectCanonicalId: string;
  subjectProtocol: string;
};

type BlockedAccount = LdpResource & {
  subjectCanonicalId: string;
  subjectProtocol: string;
};

type ParsedFediverseRow = {
  account: string;
  hideNotifications?: boolean;
};

function useSection<T extends LdpResource>(container: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.list(container);
      setItems(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [container]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async (data: Omit<T, '@id'>) => {
    setSaving(true);
    try {
      await dashboardApi.create(container, data);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (uri: string) => {
    try {
      await dashboardApi.remove(uri);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to delete');
    }
  };

  const update = async (resourceUri: string, data: Partial<T>) => {
    setSaving(true);
    try {
      await dashboardApi.update(resourceUri, data);
      await load();
    } catch (e: any) {
      setError(e.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return { items, loading, saving, error, add, remove, update, reload: load };
}

const itemUri = (item: LdpResource) => item['@id'];

const FILTER_DURATION_OPTIONS: Array<{ value: FilterDuration; label: string }> = [
  { value: 'indefinite', label: 'Indefinitely' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '1w', label: '1 week' },
  { value: '1m', label: '1 month' }
];

const PROTOCOL_OPTIONS: Array<{ value: SubjectProtocol; label: string }> = [
  { value: 'ap', label: 'ActivityPub' },
  { value: 'atproto', label: 'ATProto/Bluesky' }
];

function deriveHashtag(term: string) {
  const cleaned = term
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, '');

  return cleaned.length > 0 ? `#${cleaned}` : '#';
}

function buildSemanticTerms(input: string, mode: FilterMatchType, includeHashtags: boolean) {
  const sourceTerms =
    mode === 'phrase'
      ? [input.trim()]
      : input
          .split(/[\n,]+/)
          .map(token => token.trim())
          .filter(Boolean);

  const deduped = new Map<string, string>();
  for (const term of sourceTerms) {
    const normalized = term.toLowerCase();
    if (!deduped.has(normalized)) deduped.set(normalized, term);

    if (includeHashtags) {
      const hashtag = deriveHashtag(term);
      const hashtagKey = hashtag.toLowerCase();
      if (!deduped.has(hashtagKey)) deduped.set(hashtagKey, hashtag);

      const plain = hashtag.replace(/^#/, '');
      const plainKey = plain.toLowerCase();
      if (plain.length > 0 && !deduped.has(plainKey)) deduped.set(plainKey, plain);
    }
  }

  return [...deduped.values()];
}

function resolveExpiresAt(duration: FilterDuration) {
  if (duration === 'indefinite') return undefined;

  const now = Date.now();
  const offsets: Record<Exclude<FilterDuration, 'indefinite'>, number> = {
    '12h': 12 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000,
    '1m': 30 * 24 * 60 * 60 * 1000
  };

  return new Date(now + offsets[duration]).toISOString();
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeFediverseAccount(raw: string) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  if (trimmed.includes('://')) {
    return trimmed;
  }

  if (trimmed.startsWith('@')) {
    const withoutLeading = trimmed.replace(/^@+/, '');
    const secondAtIndex = withoutLeading.indexOf('@');
    if (secondAtIndex > 0) {
      return `${withoutLeading.slice(0, secondAtIndex)}@${withoutLeading.slice(secondAtIndex + 1)}`;
    }
    return withoutLeading;
  }

  return trimmed;
}

function parseFediverseAccountCsv(input: string, includeHideNotifications: boolean) {
  const lines = input
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#') && !line.startsWith('//'));

  if (lines.length === 0) return [] as ParsedFediverseRow[];

  let rows = lines;
  const maybeHeader = parseCsvLine(lines[0]).map(cell => cell.toLowerCase());
  if (maybeHeader.includes('account address') || maybeHeader.includes('acct')) {
    rows = lines.slice(1);
  }

  const parsed: ParsedFediverseRow[] = [];
  for (const row of rows) {
    const cells = row.includes(',') ? parseCsvLine(row) : [row];
    const account = normalizeFediverseAccount(cells[0] || '');
    if (!account) continue;

    const hideNotifications = includeHideNotifications
      ? String(cells[1] || 'true').toLowerCase() !== 'false'
      : undefined;

    parsed.push({ account, hideNotifications });
  }

  const deduped = new Map<string, ParsedFediverseRow>();
  for (const entry of parsed) {
    deduped.set(entry.account.toLowerCase(), entry);
  }

  return [...deduped.values()];
}

function exportFediverseAccountCsv(rows: ParsedFediverseRow[], includeHideNotifications: boolean) {
  if (!includeHideNotifications) {
    return `Account address\n${rows.map(row => row.account).join('\n')}\n`;
  }

  return `Account address,Hide notifications\n${rows
    .map(row => `${row.account},${row.hideNotifications === false ? 'false' : 'true'}`)
    .join('\n')}\n`;
}

function downloadCsvFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

const SectionShell = ({
  title,
  count,
  loading,
  error,
  children
}: {
  title: string;
  count: number;
  loading: boolean;
  error: string | null;
  children: React.ReactNode;
}) => (
  <Accordion defaultExpanded={false} disableGutters>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography fontWeight={500}>
        {title}
        {loading === false && (
          <Typography component="span" variant="body2" color="text.secondary" ml={1}>
            ({count})
          </Typography>
        )}
      </Typography>
    </AccordionSummary>
    <AccordionDetails>
      {loading && <CircularProgress size={20} />}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      {children}
    </AccordionDetails>
  </Accordion>
);

const ModerationPage = () => {
  const filters = useSection<KeywordFilter>('filters');
  const mutes = useSection<MutedAccount>('mutes');
  const blocks = useSection<BlockedAccount>('blocks');
  const preferences = useSection<Preference>('preferences');

  const [monthlySummary, setMonthlySummary] = useState<MonthlyModerationSummary | null>(null);
  const [monthlySummaryLoading, setMonthlySummaryLoading] = useState(false);
  const [monthlySummaryError, setMonthlySummaryError] = useState<string | null>(null);
  const [monthlySummarySending, setMonthlySummarySending] = useState(false);
  const [monthlySummarySendStatus, setMonthlySummarySendStatus] = useState<string | null>(null);

  const [filterPattern, setFilterPattern] = useState('');
  const [filterAction, setFilterAction] = useState<FilterAction>('hide');
  const [filterMatchType, setFilterMatchType] = useState<FilterMatchType>('word');
  const [filterDuration, setFilterDuration] = useState<FilterDuration>('indefinite');
  const [includeHashtagVariants, setIncludeHashtagVariants] = useState(true);
  const [muteSubject, setMuteSubject] = useState('');
  const [muteProtocol, setMuteProtocol] = useState<SubjectProtocol>('ap');
  const [blockSubject, setBlockSubject] = useState('');
  const [blockProtocol, setBlockProtocol] = useState<SubjectProtocol>('ap');
  const [atprotoIdentifier, setAtprotoIdentifier] = useState('');
  const [atprotoPassword, setAtprotoPassword] = useState('');
  const [atprotoPdsUrl, setAtprotoPdsUrl] = useState('');
  const [atprotoLoading, setAtprotoLoading] = useState(false);
  const [atprotoSyncing, setAtprotoSyncing] = useState(false);
  const [atprotoError, setAtprotoError] = useState<string | null>(null);
  const [atprotoSyncMessage, setAtprotoSyncMessage] = useState<string | null>(null);
  const [atprotoPreview, setAtprotoPreview] = useState<AtprotoListPreview | null>(null);
  const [atprotoAutoSyncEnabled, setAtprotoAutoSyncEnabled] = useState(false);
  const [atprotoAutoSyncReplace, setAtprotoAutoSyncReplace] = useState(false);
  const [atprotoAutoSyncIntervalHours, setAtprotoAutoSyncIntervalHours] = useState(6);
  const [atprotoHasStoredSecret, setAtprotoHasStoredSecret] = useState(false);
  const [atprotoLastSyncAt, setAtprotoLastSyncAt] = useState<string | null>(null);
  const [atprotoLastSyncError, setAtprotoLastSyncError] = useState<string | null>(null);
  const [atprotoSavingConfig, setAtprotoSavingConfig] = useState(false);
  const [atprotoLabelers, setAtprotoLabelers] = useState<AtprotoLabelerCatalogEntry[]>([]);
  const [atprotoLabelersLoading, setAtprotoLabelersLoading] = useState(false);
  const [atprotoLabelersError, setAtprotoLabelersError] = useState<string | null>(null);
  const [atprotoLabelerActionKey, setAtprotoLabelerActionKey] = useState<string | null>(null);
  const [atprotoLabelerQuery, setAtprotoLabelerQuery] = useState('');
  const [atprotoLabelerManualSource, setAtprotoLabelerManualSource] = useState('');
  const [atprotoLabelerManualLoading, setAtprotoLabelerManualLoading] = useState(false);
  const [atprotoLabelerNotice, setAtprotoLabelerNotice] = useState<string | null>(null);
  const [fediverseMutesInput, setFediverseMutesInput] = useState('');
  const [fediverseBlocksInput, setFediverseBlocksInput] = useState('');
  const [fediverseMutesReplace, setFediverseMutesReplace] = useState(false);
  const [fediverseBlocksReplace, setFediverseBlocksReplace] = useState(false);
  const [fediverseMutesImporting, setFediverseMutesImporting] = useState(false);
  const [fediverseBlocksImporting, setFediverseBlocksImporting] = useState(false);
  const [fediverseMutesNotice, setFediverseMutesNotice] = useState<string | null>(null);
  const [fediverseBlocksNotice, setFediverseBlocksNotice] = useState<string | null>(null);
  const loadMonthlySummary = useCallback(async () => {
    setMonthlySummaryLoading(true);
    setMonthlySummaryError(null);

    try {
      const result = await dashboardApi.getMonthlyModerationSummary();
      setMonthlySummary(result?.data || null);
    } catch (error: any) {
      setMonthlySummary(null);
      setMonthlySummaryError(error?.message || 'Failed to load monthly summary.');
    } finally {
      setMonthlySummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMonthlySummary();
  }, [loadMonthlySummary]);

  useEffect(() => {
    let active = true;
    dashboardApi
      .getAtprotoModerationSyncConfig()
      .then(result => {
        if (!active) return;
        const cfg = (result?.data || {}) as AtprotoSyncConfig;
        setAtprotoAutoSyncEnabled(Boolean(cfg.enabled));
        setAtprotoAutoSyncReplace(Boolean(cfg.replace));
        setAtprotoAutoSyncIntervalHours(Number.isFinite(Number(cfg.intervalHours)) ? Number(cfg.intervalHours) : 6);
        setAtprotoHasStoredSecret(Boolean(cfg.hasStoredSecret));
        setAtprotoLastSyncAt(cfg.lastSyncAt || null);
        setAtprotoLastSyncError(cfg.lastSyncError || null);
        if (!atprotoIdentifier && cfg.identifier) setAtprotoIdentifier(cfg.identifier);
        if (!atprotoPdsUrl && cfg.pdsUrl) setAtprotoPdsUrl(cfg.pdsUrl);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const loadAtprotoLabelers = useCallback(async () => {
    setAtprotoLabelersLoading(true);
    setAtprotoLabelersError(null);

    try {
      const result = await dashboardApi.listAtprotoLabelerCatalog();
      setAtprotoLabelers((result?.data || []) as AtprotoLabelerCatalogEntry[]);
    } catch (error: any) {
      setAtprotoLabelers([]);
      setAtprotoLabelersError(error?.message || 'Failed to load ATProto labelers.');
    } finally {
      setAtprotoLabelersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAtprotoLabelers();
  }, [loadAtprotoLabelers]);

  useEffect(() => {
    const refreshOnFocus = () => {
      loadAtprotoLabelers();
    };

    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadAtprotoLabelers();
      }
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);

    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [loadAtprotoLabelers]);

  const findPreference = useCallback(
    (category: string) => preferences.items.find(item => item.category === category),
    [preferences.items]
  );

  const getBooleanPreference = useCallback(
    (category: string, defaultValue = false) => {
      const pref = findPreference(category);
      return typeof pref?.value === 'boolean' ? pref.value : defaultValue;
    },
    [findPreference]
  );

  const getStringPreference = useCallback(
    (category: string, defaultValue: string) => {
      const pref = findPreference(category);
      return typeof pref?.value === 'string' ? pref.value : defaultValue;
    },
    [findPreference]
  );

  const upsertPreference = useCallback(
    async (category: string, value: unknown) => {
      const existing = findPreference(category);
      if (existing) {
        await preferences.update(itemUri(existing), { value } as Partial<Preference>);
      } else {
        await preferences.add({ category, value } as Omit<Preference, '@id'>);
      }
    },
    [findPreference, preferences]
  );

  const handleAddFilter = async () => {
    if (filterPattern.trim().length === 0) return;

    const terms = buildSemanticTerms(filterPattern, filterMatchType, includeHashtagVariants);
    if (terms.length === 0) return;

    await filters.add({
      pattern: terms[0],
      terms,
      action: filterAction,
      matchType: filterMatchType,
      includeHashtagVariants,
      duration: filterDuration,
      expiresAt: resolveExpiresAt(filterDuration)
    });

    setFilterPattern('');
    setFilterAction('hide');
    setFilterMatchType('word');
    setFilterDuration('indefinite');
    setIncludeHashtagVariants(true);
  };

  const handleAddMute = async () => {
    if (muteSubject.trim().length === 0) return;
    await mutes.add({ subjectCanonicalId: muteSubject.trim(), subjectProtocol: muteProtocol });
    setMuteSubject('');
  };

  const handleAddBlock = async () => {
    if (blockSubject.trim().length === 0) return;
    await blocks.add({ subjectCanonicalId: blockSubject.trim(), subjectProtocol: blockProtocol });
    setBlockSubject('');
  };

  const fetchAtprotoLists = async () => {
    setAtprotoLoading(true);
    setAtprotoError(null);
    setAtprotoSyncMessage(null);
    try {
      const result = await dashboardApi.fetchAtprotoModerationLists({
        identifier: atprotoIdentifier.trim() || undefined,
        password: atprotoPassword || undefined,
        pdsUrl: atprotoPdsUrl.trim() || undefined,
        limit: 100,
        maxPages: 10
      });
      setAtprotoPreview((result?.data || null) as AtprotoListPreview | null);
    } catch (error: any) {
      setAtprotoPreview(null);
      setAtprotoError(error?.message || 'Failed to fetch ATProto moderation lists.');
    } finally {
      setAtprotoLoading(false);
    }
  };

  const syncAtprotoLists = async (replace = false) => {
    setAtprotoSyncing(true);
    setAtprotoError(null);
    setAtprotoSyncMessage(null);
    try {
      const result = await dashboardApi.syncAtprotoModerationLists({
        identifier: atprotoIdentifier.trim() || undefined,
        password: atprotoPassword || undefined,
        pdsUrl: atprotoPdsUrl.trim() || undefined,
        limit: 100,
        maxPages: 10,
        replace
      });

      const mutesResult = result?.data?.mutes;
      const blocksResult = result?.data?.blocks;
      setAtprotoSyncMessage(
        `Synced ATProto lists. Mutes: +${mutesResult?.created || 0} (${mutesResult?.remoteCount || 0} remote). Blocks: +${blocksResult?.created || 0} (${blocksResult?.remoteCount || 0} remote).`
      );

      await Promise.all([mutes.reload(), blocks.reload()]);
      await fetchAtprotoLists();
  await loadAtprotoLabelers();

      const cfg = await dashboardApi.getAtprotoModerationSyncConfig();
      const cfgData = (cfg?.data || {}) as AtprotoSyncConfig;
      setAtprotoLastSyncAt(cfgData.lastSyncAt || null);
      setAtprotoLastSyncError(cfgData.lastSyncError || null);
    } catch (error: any) {
      setAtprotoError(error?.message || 'Failed to sync ATProto moderation lists.');
    } finally {
      setAtprotoSyncing(false);
    }
  };

  const saveAtprotoSyncConfig = async () => {
    setAtprotoSavingConfig(true);
    setAtprotoError(null);
    try {
      const result = await dashboardApi.setAtprotoModerationSyncConfig({
        enabled: atprotoAutoSyncEnabled,
        replace: atprotoAutoSyncReplace,
        intervalHours: atprotoAutoSyncIntervalHours,
        pdsUrl: atprotoPdsUrl.trim() || undefined,
        identifier: atprotoIdentifier.trim() || undefined,
        password: atprotoPassword.trim() ? atprotoPassword : undefined
      });

      const cfg = (result?.data || {}) as AtprotoSyncConfig;
      setAtprotoHasStoredSecret(Boolean(cfg.hasStoredSecret));
      setAtprotoLastSyncAt(cfg.lastSyncAt || null);
      setAtprotoLastSyncError(cfg.lastSyncError || null);
      setAtprotoSyncMessage('ATProto auto-sync settings saved.');
      if (atprotoPassword) setAtprotoPassword('');
    } catch (error: any) {
      setAtprotoError(error?.message || 'Failed to save ATProto auto-sync settings.');
    } finally {
      setAtprotoSavingConfig(false);
    }
  };

  const runAtprotoSyncNow = async () => {
    setAtprotoSyncing(true);
    setAtprotoError(null);
    try {
      const result = await dashboardApi.runAtprotoModerationSyncNow();
      if (result?.data?.skipped) {
        setAtprotoSyncMessage(`ATProto sync skipped: ${result.data.reason || 'not_due'}`);
      } else if (result?.data?.error) {
        setAtprotoSyncMessage(`ATProto sync failed: ${result.data.error}`);
      } else {
        setAtprotoSyncMessage('ATProto sync executed.');
      }

      const cfg = await dashboardApi.getAtprotoModerationSyncConfig();
      const cfgData = (cfg?.data || {}) as AtprotoSyncConfig;
      setAtprotoLastSyncAt(cfgData.lastSyncAt || null);
      setAtprotoLastSyncError(cfgData.lastSyncError || null);
      await Promise.all([mutes.reload(), blocks.reload()]);
      await loadAtprotoLabelers();
    } catch (error: any) {
      setAtprotoError(error?.message || 'Failed to run ATProto sync now.');
    } finally {
      setAtprotoSyncing(false);
    }
  };

  const installAtprotoLabeler = async (item: AtprotoLabelerCatalogEntry) => {
    const actionKey = item.did || item.source;
    setAtprotoLabelerActionKey(actionKey);
    setAtprotoLabelersError(null);
    setAtprotoLabelerNotice(null);

    try {
      await dashboardApi.create('trust-sources', {
        source: item.did || item.source,
        sourceType: 'atproto-labeler',
        enabled: true,
        weight: item.weight ?? 1,
        priority: item.priority ?? 100,
        scopes: item.scopes?.length ? item.scopes : ['label:content', 'label:actor', 'filter:content', 'filter:actor'],
        name: item.name,
        description: item.description || undefined
      });
      await loadAtprotoLabelers();
      setAtprotoLabelerNotice(`${item.name || item.handle || item.did || item.source} added.`);
    } catch (error: any) {
      setAtprotoLabelersError(error?.message || 'Failed to add ATProto labeler.');
    } finally {
      setAtprotoLabelerActionKey(null);
    }
  };

  const toggleAtprotoLabeler = async (item: AtprotoLabelerCatalogEntry, enabled: boolean) => {
    if (!item.resourceUri) return;

    setAtprotoLabelerActionKey(item.resourceUri);
    setAtprotoLabelersError(null);
    setAtprotoLabelerNotice(null);

    try {
      await dashboardApi.update(item.resourceUri, { enabled });
      await loadAtprotoLabelers();
      setAtprotoLabelerNotice(`${item.name || item.handle || item.did || item.source} ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (error: any) {
      setAtprotoLabelersError(error?.message || 'Failed to update ATProto labeler.');
    } finally {
      setAtprotoLabelerActionKey(null);
    }
  };

  const removeAtprotoLabeler = async (item: AtprotoLabelerCatalogEntry) => {
    if (!item.resourceUri || item.immutable) return;

    setAtprotoLabelerActionKey(item.resourceUri);
    setAtprotoLabelersError(null);
    setAtprotoLabelerNotice(null);

    try {
      await dashboardApi.remove(item.resourceUri);
      await loadAtprotoLabelers();
      setAtprotoLabelerNotice(`${item.name || item.handle || item.did || item.source} removed.`);
    } catch (error: any) {
      setAtprotoLabelersError(error?.message || 'Failed to remove ATProto labeler.');
    } finally {
      setAtprotoLabelerActionKey(null);
    }
  };

  const addCustomAtprotoLabeler = async () => {
    const rawValue = atprotoLabelerManualSource.trim();
    if (!rawValue) return;

    setAtprotoLabelersError(null);
    setAtprotoLabelerNotice(null);
    setAtprotoLabelerManualLoading(true);

    try {
      const normalized = rawValue.toLowerCase();
      const existing = atprotoLabelers.find(item =>
        [item.source, item.did, item.handle].some(candidate => String(candidate || '').trim().toLowerCase() === normalized)
      );

      if (existing?.installed) {
        setAtprotoLabelerNotice(`${existing.name || existing.handle || existing.did || existing.source} is already installed.`);
        return;
      }

      if (existing) {
        await installAtprotoLabeler(existing);
        setAtprotoLabelerManualSource('');
        return;
      }

      let resolvedDid = rawValue;
      let resolvedHandle: string | undefined;

      if (!rawValue.startsWith('did:')) {
        const result = await dashboardApi.resolveAtprotoHandle(rawValue, atprotoPdsUrl.trim() || undefined);
        const resolved = (result?.data || {}) as AtprotoHandleResolution;

        if (!resolved.did) {
          throw new Error('Could not resolve that ATProto handle.');
        }

        resolvedDid = resolved.did;
        resolvedHandle = resolved.handle || rawValue;
      }

      await dashboardApi.create('trust-sources', {
        source: resolvedDid,
        sourceType: 'atproto-labeler',
        enabled: true,
        weight: 1,
        priority: 100,
        scopes: ['label:content', 'label:actor', 'filter:content', 'filter:actor'],
        name: resolvedHandle || rawValue
      });

      await loadAtprotoLabelers();
      setAtprotoLabelerManualSource('');
      setAtprotoLabelerNotice(`${resolvedHandle || resolvedDid} added.`);
    } catch (error: any) {
      setAtprotoLabelersError(error?.message || 'Failed to add ATProto labeler.');
    } finally {
      setAtprotoLabelerManualLoading(false);
    }
  };

  const normalizedAtprotoLabelerQuery = atprotoLabelerQuery.trim().toLowerCase();
  const installedAtprotoLabelers = atprotoLabelers.filter(item => item.installed);
  const discoverableAtprotoLabelers = atprotoLabelers.filter(item => !item.installed);
  const filteredDiscoverableAtprotoLabelers = discoverableAtprotoLabelers.filter(item => {
    if (!normalizedAtprotoLabelerQuery) return true;

    return [item.name, item.handle, item.did, item.source, item.description]
      .filter(Boolean)
      .some(value => String(value).toLowerCase().includes(normalizedAtprotoLabelerQuery));
  });
  const visibleDiscoverableAtprotoLabelers = normalizedAtprotoLabelerQuery
    ? filteredDiscoverableAtprotoLabelers
    : filteredDiscoverableAtprotoLabelers.slice(0, 12);

  const parsedFediverseMutes = parseFediverseAccountCsv(fediverseMutesInput, true);
  const parsedFediverseBlocks = parseFediverseAccountCsv(fediverseBlocksInput, false);

  const handleFediverseFileInput = async (
    event: React.ChangeEvent<HTMLInputElement>,
    target: 'mutes' | 'blocks'
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (target === 'mutes') {
        setFediverseMutesInput(text);
        setFediverseMutesNotice(`Loaded ${file.name}`);
      } else {
        setFediverseBlocksInput(text);
        setFediverseBlocksNotice(`Loaded ${file.name}`);
      }
    } catch {
      if (target === 'mutes') {
        setFediverseMutesNotice('Could not read file.');
      } else {
        setFediverseBlocksNotice('Could not read file.');
      }
    } finally {
      event.target.value = '';
    }
  };

  const importFediverseRows = async (target: 'mutes' | 'blocks') => {
    const parsedRows = target === 'mutes' ? parsedFediverseMutes : parsedFediverseBlocks;
    const section = target === 'mutes' ? mutes : blocks;
    const replace = target === 'mutes' ? fediverseMutesReplace : fediverseBlocksReplace;

    if (parsedRows.length === 0) return;

    if (target === 'mutes') {
      setFediverseMutesImporting(true);
      setFediverseMutesNotice(null);
    } else {
      setFediverseBlocksImporting(true);
      setFediverseBlocksNotice(null);
    }

    try {
      const existingFediverse = section.items.filter(item => String(item.subjectProtocol || '').toLowerCase() === 'ap');

      if (replace) {
        await Promise.all(existingFediverse.map(item => dashboardApi.remove(itemUri(item))));
      }

      const existingSet = new Set(
        (replace ? [] : existingFediverse)
          .map(item => String(item.subjectCanonicalId || '').trim().toLowerCase())
          .filter(Boolean)
      );

      let added = 0;
      for (const row of parsedRows) {
        const key = row.account.toLowerCase();
        if (existingSet.has(key)) continue;

        await dashboardApi.create(target, {
          subjectCanonicalId: row.account,
          subjectProtocol: 'ap'
        });

        existingSet.add(key);
        added += 1;
      }

      await section.reload();
      if (target === 'mutes') {
        setFediverseMutesNotice(`Imported ${added} mute entries.`);
      } else {
        setFediverseBlocksNotice(`Imported ${added} block entries.`);
      }
    } catch (error: any) {
      if (target === 'mutes') {
        setFediverseMutesNotice(error?.message || 'Failed to import mutes CSV.');
      } else {
        setFediverseBlocksNotice(error?.message || 'Failed to import blocks CSV.');
      }
    } finally {
      if (target === 'mutes') {
        setFediverseMutesImporting(false);
      } else {
        setFediverseBlocksImporting(false);
      }
    }
  };

  const exportFediverseRows = (target: 'mutes' | 'blocks') => {
    const items = (target === 'mutes' ? mutes.items : blocks.items).filter(
      item => String(item.subjectProtocol || '').toLowerCase() === 'ap'
    );

    const rows: ParsedFediverseRow[] = items
      .map(item => ({
        account: String(item.subjectCanonicalId || '').trim(),
        hideNotifications: target === 'mutes' ? true : undefined
      }))
      .filter(item => item.account.length > 0);

    const csv = exportFediverseAccountCsv(rows, target === 'mutes');
    downloadCsvFile(target === 'mutes' ? 'muted_accounts.csv' : 'blocked_accounts.csv', csv);
  };

  const handleSendMonthlySummaryNow = async () => {
    setMonthlySummarySending(true);
    setMonthlySummarySendStatus(null);

    try {
      const result = await dashboardApi.sendMonthlyModerationSummary(true);
      if (result?.data?.delivered) {
        setMonthlySummarySendStatus('Monthly moderation summary sent.');
      } else if (result?.data?.skipped) {
        setMonthlySummarySendStatus('Monthly moderation summary skipped by backend rules.');
      } else {
        setMonthlySummarySendStatus('Monthly moderation summary could not be delivered.');
      }
      await loadMonthlySummary();
    } catch (error: any) {
      setMonthlySummarySendStatus(error?.message || 'Failed to send monthly moderation summary.');
    } finally {
      setMonthlySummarySending(false);
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Moderation
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        These rules are stored in your Pod and shared with apps that request access. Apps can choose where to apply
        them in their own UI contexts.
      </Typography>

      <SectionShell
        title="Pod User: Keyword Filters"
        count={filters.items.length}
        loading={filters.loading}
        error={filters.error}
      >
        {filters.loading === false && filters.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No keyword filters yet.
          </Typography>
        )}
        <List dense disablePadding>
          {filters.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText
                primary={item.pattern}
                secondary={`mode: ${item.matchType || 'word'} | action: ${item.action || 'hide'} | duration: ${item.duration || 'indefinite'}`}
                primaryTypographyProps={{ fontFamily: 'monospace' }}
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  onClick={() => filters.remove(itemUri(item))}
                  aria-label="delete filter"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mt={2} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            label="Word(s) or phrase"
            value={filterPattern}
            onChange={e => setFilterPattern(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddFilter()}
            sx={{ flex: 1 }}
            helperText="Words can be comma/newline separated. Phrase mode stores exact text."
          />
          <Select
            size="small"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value as FilterAction)}
            sx={{ minWidth: 100 }}
          >
            <MenuItem value="hide">Hide</MenuItem>
            <MenuItem value="warn">Warn</MenuItem>
            <MenuItem value="filter">Filter</MenuItem>
          </Select>
          <Select
            size="small"
            value={filterMatchType}
            onChange={e => setFilterMatchType(e.target.value as FilterMatchType)}
            sx={{ minWidth: 110 }}
          >
            <MenuItem value="word">Word</MenuItem>
            <MenuItem value="phrase">Phrase</MenuItem>
          </Select>
          <Select
            size="small"
            value={filterDuration}
            onChange={e => setFilterDuration(e.target.value as FilterDuration)}
            sx={{ minWidth: 130 }}
          >
            {FILTER_DURATION_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          <FormControlLabel
            control={
              <Checkbox
                checked={includeHashtagVariants}
                onChange={e => setIncludeHashtagVariants(e.target.checked)}
              />
            }
            label="Match hashtag variants"
            sx={{ ml: { xs: 0, md: 1 } }}
          />
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={filterPattern.trim().length === 0 || filters.saving}
            onClick={handleAddFilter}
          >
            Add
          </Button>
        </Stack>
      </SectionShell>

        <SectionShell title="Import From ATProto/Bluesky" count={0} loading={false} error={atprotoError}>
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Import your Bluesky mute/block lists into local moderation settings.
            </Typography>

            {atprotoSyncMessage && <Alert severity="success">{atprotoSyncMessage}</Alert>}

            <TextField
              size="small"
              label="ATProto identifier"
              value={atprotoIdentifier}
              onChange={e => setAtprotoIdentifier(e.target.value)}
              placeholder="you.bsky.social"
              fullWidth
            />

            <TextField
              size="small"
              label="ATProto app password"
              type="password"
              value={atprotoPassword}
              onChange={e => setAtprotoPassword(e.target.value)}
              helperText={atprotoHasStoredSecret ? 'Leave blank to keep stored secret unchanged.' : 'Required unless previously stored.'}
              fullWidth
            />

            <TextField
              size="small"
              label="PDS URL (optional)"
              value={atprotoPdsUrl}
              onChange={e => setAtprotoPdsUrl(e.target.value)}
              placeholder="https://bsky.social"
              fullWidth
            />

            <Stack direction="row" spacing={1}>
              <Button variant="outlined" onClick={fetchAtprotoLists} disabled={atprotoLoading || atprotoSyncing}>
                {atprotoLoading ? 'Loading…' : 'Preview Lists'}
              </Button>
              <Button variant="contained" onClick={() => syncAtprotoLists(false)} disabled={atprotoLoading || atprotoSyncing}>
                {atprotoSyncing ? 'Syncing…' : 'Sync (merge)'}
              </Button>
              <Button variant="text" color="warning" onClick={() => syncAtprotoLists(true)} disabled={atprotoLoading || atprotoSyncing}>
                Replace ATProto entries
              </Button>
              <Button variant="outlined" onClick={runAtprotoSyncNow} disabled={atprotoLoading || atprotoSyncing}>
                Run auto-sync now
              </Button>
            </Stack>

            <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Automatic Sync (Phase 2)
              </Typography>
              <Stack spacing={1.25}>
                <FormControlLabel
                  control={<Checkbox checked={atprotoAutoSyncEnabled} onChange={e => setAtprotoAutoSyncEnabled(e.target.checked)} />}
                  label="Enable periodic auto-sync from Bluesky"
                />
                <FormControlLabel
                  control={<Checkbox checked={atprotoAutoSyncReplace} onChange={e => setAtprotoAutoSyncReplace(e.target.checked)} />}
                  label="Replace existing ATProto entries during auto-sync"
                />
                <TextField
                  size="small"
                  type="number"
                  label="Auto-sync interval (hours)"
                  value={atprotoAutoSyncIntervalHours}
                  onChange={e => setAtprotoAutoSyncIntervalHours(Math.max(1, Math.min(24, Number(e.target.value) || 6)))}
                  inputProps={{ min: 1, max: 24 }}
                />
                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={saveAtprotoSyncConfig} disabled={atprotoSavingConfig}>
                    {atprotoSavingConfig ? 'Saving…' : 'Save auto-sync settings'}
                  </Button>
                </Stack>
                <Typography variant="caption" color="text.secondary">
                  Last sync: {atprotoLastSyncAt ? new Date(atprotoLastSyncAt).toLocaleString() : 'Never'}
                </Typography>
                {atprotoLastSyncError && (
                  <Alert severity="warning" sx={{ mt: 0.5 }}>
                    Last sync error: {atprotoLastSyncError}
                  </Alert>
                )}
              </Stack>
            </Box>

            {atprotoPreview && (
              <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary" display="block">
                  Source: {atprotoPreview.handle || atprotoPreview.did || 'linked account'} via {atprotoPreview.pdsUrl}
                </Typography>
                <Typography variant="body2">Remote mutes: {atprotoPreview.mutes.length}</Typography>
                <Typography variant="body2">Remote blocks: {atprotoPreview.blocks.length}</Typography>
              </Box>
            )}
          </Stack>
        </SectionShell>

      <SectionShell
        title="Pod User: ATProto Labelers"
        count={atprotoLabelers.filter(item => item.installed).length}
        loading={atprotoLabelersLoading}
        error={atprotoLabelersError}
      >
        <Stack spacing={1.5}>
          <Typography variant="body2" color="text.secondary">
            Select Bluesky-compatible labelers to reflect in your Pod moderation settings. Installed labelers stay at
            the top, and the public directory below lets you browse or search for more.
          </Typography>

          {atprotoLabelerNotice && <Alert severity="success">{atprotoLabelerNotice}</Alert>}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
            <TextField
              size="small"
              label="Search public labelers"
              value={atprotoLabelerQuery}
              onChange={e => setAtprotoLabelerQuery(e.target.value)}
              placeholder="Search by name, handle, DID, or description"
              fullWidth
              helperText={
                normalizedAtprotoLabelerQuery
                  ? `${filteredDiscoverableAtprotoLabelers.length} public labelers match this search.`
                  : `${discoverableAtprotoLabelers.length} public labelers available from the directory.`
              }
            />
            <Button
              variant="outlined"
              href="https://www.bluesky-labelers.io/"
              target="_blank"
              rel="noopener noreferrer"
              sx={{ whiteSpace: 'nowrap' }}
            >
              Open directory
            </Button>
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', md: 'flex-start' }}>
            <TextField
              size="small"
              label="Add by handle or DID"
              value={atprotoLabelerManualSource}
              onChange={e => setAtprotoLabelerManualSource(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && void addCustomAtprotoLabeler()}
              placeholder="moderation.moe or did:plc:..."
              fullWidth
              helperText="Use this if a labeler is missing from the public directory."
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={addCustomAtprotoLabeler}
              disabled={atprotoLabelerManualLoading || atprotoLabelerManualSource.trim().length === 0}
              sx={{ whiteSpace: 'nowrap' }}
            >
              {atprotoLabelerManualLoading ? 'Adding…' : 'Add labeler'}
            </Button>
          </Stack>

          {atprotoLabelersLoading === false && atprotoLabelers.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No ATProto labelers available yet.
            </Typography>
          )}

          <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              Installed labelers
            </Typography>

            {installedAtprotoLabelers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No labelers installed yet.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {installedAtprotoLabelers.map(item => {
                  const actionKey = item.resourceUri || item.did || item.source;
                  const secondaryParts = [item.handle, item.did || item.source];

                  if (item.recommended) secondaryParts.push('Recommended');
                  if (item.syncOrigin === 'atproto-preferences-sync') secondaryParts.push('Synced from ATProto preferences');
                  secondaryParts.push(item.enabled ? 'Enabled' : 'Disabled');

                  return (
                    <Box key={actionKey} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.25 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle2">{item.name || item.handle || item.did || item.source}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {secondaryParts.filter(Boolean).join(' | ')}
                          </Typography>
                          {item.description && (
                            <Typography variant="body2" color="text.secondary" mt={0.5}>
                              {item.description}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant={item.enabled ? 'contained' : 'outlined'}
                            onClick={() => toggleAtprotoLabeler(item, !item.enabled)}
                            disabled={atprotoLabelerActionKey === actionKey}
                          >
                            {item.enabled ? 'Disable' : 'Enable'}
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            href={`https://bsky.app/profile/${item.did || item.handle || item.source}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                          </Button>
                          {!item.immutable && (
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => removeAtprotoLabeler(item)}
                              aria-label="remove labeler"
                              disabled={atprotoLabelerActionKey === actionKey}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          )}
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>

          <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
            <Typography variant="subtitle2" gutterBottom>
              Browse public labelers
            </Typography>

            {!normalizedAtprotoLabelerQuery && filteredDiscoverableAtprotoLabelers.length > visibleDiscoverableAtprotoLabelers.length && (
              <Typography variant="body2" color="text.secondary" mb={1}>
                Showing the first {visibleDiscoverableAtprotoLabelers.length} public labelers. Search to narrow the list.
              </Typography>
            )}

            {filteredDiscoverableAtprotoLabelers.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No public labelers match this search.
              </Typography>
            ) : (
              <Stack spacing={1}>
                {visibleDiscoverableAtprotoLabelers.map(item => {
                  const actionKey = item.resourceUri || item.did || item.source;
                  const secondaryParts = [item.handle, item.did || item.source];

                  if (item.recommended) secondaryParts.push('Recommended');
                  if (item.directorySource) secondaryParts.push(`Directory: ${item.directorySource}`);

                  return (
                    <Box key={actionKey} sx={{ p: 1.25, border: '1px solid', borderColor: 'divider', borderRadius: 1.25 }}>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle2">{item.name || item.handle || item.did || item.source}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {secondaryParts.filter(Boolean).join(' | ')}
                          </Typography>
                          {item.description && (
                            <Typography variant="body2" color="text.secondary" mt={0.5}>
                              {item.description}
                            </Typography>
                          )}
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Button
                            size="small"
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={() => installAtprotoLabeler(item)}
                            disabled={atprotoLabelerActionKey === actionKey}
                          >
                            Add
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            href={`https://bsky.app/profile/${item.did || item.handle || item.source}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Open
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Box>
        </Stack>
      </SectionShell>

      <SectionShell
        title="Pod User: Sensitive Content and Media Display"
        count={4}
        loading={preferences.loading}
        error={preferences.error}
      >
        <Stack spacing={2}>
          <FormControl size="small" sx={{ maxWidth: 360 }}>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Media marked as sensitive
            </Typography>
            <Select
              value={getStringPreference('sensitive-media-display', 'warn')}
              onChange={e => upsertPreference('sensitive-media-display', e.target.value)}
              disabled={preferences.saving}
            >
              <MenuItem value="hide">Hide (drop from feed)</MenuItem>
              <MenuItem value="warn">Warn (show behind blur)</MenuItem>
              <MenuItem value="off">Off (show normally)</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel
            control={
              <Checkbox
                checked={getBooleanPreference('sensitive-media-color-gradients', false)}
                onChange={e => upsertPreference('sensitive-media-color-gradients', e.target.checked)}
                disabled={preferences.saving}
              />
            }
            label="Show color gradients for hidden media"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={getBooleanPreference('sensitive-expand-cw', false)}
                onChange={e => upsertPreference('sensitive-expand-cw', e.target.checked)}
                disabled={preferences.saving}
              />
            }
            label="Expand posts marked with Content Warning"
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={getBooleanPreference('moderation-monthly-summary', true)}
                onChange={e => upsertPreference('moderation-monthly-summary', e.target.checked)}
                disabled={preferences.saving}
              />
            }
            label="Receive monthly moderation summary"
          />
        </Stack>
      </SectionShell>

      <SectionShell
        title="Pod User: Monthly Moderation Summary"
        count={monthlySummary ? 1 : 0}
        loading={monthlySummaryLoading}
        error={monthlySummaryError}
      >
        {monthlySummary && (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              Period: {new Date(monthlySummary.period.start).toLocaleDateString()} -{' '}
              {new Date(monthlySummary.period.end).toLocaleDateString()}
            </Typography>
            <Typography variant="body2">
              Filters: {monthlySummary.filters.active} active / {monthlySummary.filters.total} total
            </Typography>
            <Typography variant="body2">
              Action totals: hide {monthlySummary.filters.actions.hide}, warn {monthlySummary.filters.actions.warn}, filter{' '}
              {monthlySummary.filters.actions.filter}
            </Typography>
            <Typography variant="body2">
              Mutes: {monthlySummary.mutes.total} | Blocks: {monthlySummary.blocks.total}
            </Typography>
            <Typography variant="body2">Sensitive media mode: {monthlySummary.sensitiveContent.mediaDisplayMode}</Typography>
            <Typography variant="caption" color="text.secondary">
              Generated at: {new Date(monthlySummary.generatedAt).toLocaleString()}
            </Typography>
          </Stack>
        )}
        {monthlySummarySendStatus && (
          <Alert severity="info" sx={{ mt: 1 }}>
            {monthlySummarySendStatus}
          </Alert>
        )}
        <Stack direction="row" spacing={1} mt={2}>
          <Button variant="outlined" onClick={loadMonthlySummary} disabled={monthlySummaryLoading || monthlySummarySending}>
            Refresh summary
          </Button>
          <Button variant="contained" onClick={handleSendMonthlySummaryNow} disabled={monthlySummarySending}>
            Send now
          </Button>
        </Stack>
      </SectionShell>

      <SectionShell
        title="Pod User: Muted Accounts"
        count={mutes.items.length}
        loading={mutes.loading}
        error={mutes.error}
      >
        {mutes.loading === false && mutes.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No muted accounts yet.
          </Typography>
        )}
        <List dense disablePadding>
          {mutes.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText primary={item.subjectCanonicalId} secondary={item.subjectProtocol || 'ap'} />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => mutes.remove(itemUri(item))} aria-label="unmute">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} mt={2}>
          <TextField
            size="small"
            label="Actor ID (e.g. @user@instance.social)"
            value={muteSubject}
            onChange={e => setMuteSubject(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddMute()}
            sx={{ flex: 1 }}
          />
          <Select
            size="small"
            value={muteProtocol}
            onChange={e => setMuteProtocol(e.target.value as SubjectProtocol)}
            sx={{ minWidth: 170 }}
          >
            {PROTOCOL_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={muteSubject.trim().length === 0 || mutes.saving}
            onClick={handleAddMute}
          >
            Mute
          </Button>
        </Stack>

        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Fediverse Import / Export (Mastodon CSV)
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Supports Account address and Hide notifications columns. You can paste CSV or load a file.
          </Typography>

          {fediverseMutesNotice && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {fediverseMutesNotice}
            </Alert>
          )}

          <Stack direction="row" spacing={1} mb={1}>
            <Button variant="outlined" onClick={() => exportFediverseRows('mutes')}>
              Export mutes CSV
            </Button>
            <Button component="label" variant="outlined">
              Load CSV file
              <input hidden type="file" accept=".csv,text/csv,.txt,text/plain" onChange={e => void handleFediverseFileInput(e, 'mutes')} />
            </Button>
          </Stack>

          <TextField
            multiline
            minRows={4}
            fullWidth
            value={fediverseMutesInput}
            onChange={e => setFediverseMutesInput(e.target.value)}
            placeholder={"Account address,Hide notifications\nuser@example.org,true"}
          />
          <Stack direction="row" spacing={1} mt={1} alignItems="center">
            <FormControlLabel
              control={<Checkbox checked={fediverseMutesReplace} onChange={e => setFediverseMutesReplace(e.target.checked)} />}
              label="Replace existing Fediverse mutes"
            />
            <Button
              variant="contained"
              onClick={() => importFediverseRows('mutes')}
              disabled={fediverseMutesImporting || parsedFediverseMutes.length === 0}
            >
              {fediverseMutesImporting ? 'Importing…' : `Import ${parsedFediverseMutes.length} entries`}
            </Button>
          </Stack>
        </Box>
      </SectionShell>

      <SectionShell
        title="Pod User: Blocked Accounts"
        count={blocks.items.length}
        loading={blocks.loading}
        error={blocks.error}
      >
        {blocks.loading === false && blocks.items.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={1}>
            No blocked accounts yet.
          </Typography>
        )}
        <List dense disablePadding>
          {blocks.items.map(item => (
            <ListItem key={itemUri(item)} divider>
              <ListItemText primary={item.subjectCanonicalId} secondary={item.subjectProtocol || 'ap'} />
              <ListItemSecondaryAction>
                <IconButton edge="end" size="small" onClick={() => blocks.remove(itemUri(item))} aria-label="unblock">
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          ))}
        </List>
        <Stack direction="row" spacing={1} mt={2}>
          <TextField
            size="small"
            label="Actor ID (e.g. @user@instance.social)"
            value={blockSubject}
            onChange={e => setBlockSubject(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddBlock()}
            sx={{ flex: 1 }}
          />
          <Select
            size="small"
            value={blockProtocol}
            onChange={e => setBlockProtocol(e.target.value as SubjectProtocol)}
            sx={{ minWidth: 170 }}
          >
            {PROTOCOL_OPTIONS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            disabled={blockSubject.trim().length === 0 || blocks.saving}
            onClick={handleAddBlock}
          >
            Block
          </Button>
        </Stack>

        <Box sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Fediverse Import / Export (Mastodon CSV)
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={1}>
            Supports Account address column for blocked accounts. You can paste CSV or load a file.
          </Typography>

          {fediverseBlocksNotice && (
            <Alert severity="info" sx={{ mb: 1 }}>
              {fediverseBlocksNotice}
            </Alert>
          )}

          <Stack direction="row" spacing={1} mb={1}>
            <Button variant="outlined" onClick={() => exportFediverseRows('blocks')}>
              Export blocks CSV
            </Button>
            <Button component="label" variant="outlined">
              Load CSV file
              <input hidden type="file" accept=".csv,text/csv,.txt,text/plain" onChange={e => void handleFediverseFileInput(e, 'blocks')} />
            </Button>
          </Stack>

          <TextField
            multiline
            minRows={4}
            fullWidth
            value={fediverseBlocksInput}
            onChange={e => setFediverseBlocksInput(e.target.value)}
            placeholder={"Account address\nblocked-user@example.org"}
          />
          <Stack direction="row" spacing={1} mt={1} alignItems="center">
            <FormControlLabel
              control={<Checkbox checked={fediverseBlocksReplace} onChange={e => setFediverseBlocksReplace(e.target.checked)} />}
              label="Replace existing Fediverse blocks"
            />
            <Button
              variant="contained"
              onClick={() => importFediverseRows('blocks')}
              disabled={fediverseBlocksImporting || parsedFediverseBlocks.length === 0}
            >
              {fediverseBlocksImporting ? 'Importing…' : `Import ${parsedFediverseBlocks.length} entries`}
            </Button>
          </Stack>
        </Box>
      </SectionShell>

    </Box>
  );
};

export default ModerationPage;
