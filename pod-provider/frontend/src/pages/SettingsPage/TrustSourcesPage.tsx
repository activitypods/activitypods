import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import SearchIcon from '@mui/icons-material/Search';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  InputAdornment,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type TrustSourceType =
  | 'relay'
  | 'curator'
  | 'list'
  | 'algorithmic'
  | 'atproto-labeler'
  | 'domain-blocklist'
  | 'fediseer';
type TrustScope = 'filter:content' | 'filter:actor' | 'label:content' | 'label:actor' | 'rank:down' | 'rank:up';
type MRFMode = 'disabled' | 'dry-run' | 'enforce';

type TrustSource = {
  '@id': string;
  id?: string;
  source: string;
  sourceType: TrustSourceType;
  enabled: boolean;
  weight: number;
  scopes: TrustScope[] | string[];
  name?: string;
  description?: string;
  icon?: string;
  priority?: number;
  schemaVersion: number;
};

type JsonLdScalar = string | number | boolean | { '@value'?: string; type?: string } | undefined;
type PreviewMeta = { name?: string; description?: string; icon?: string } | null;
type ParsedBlocklist = { source: string; reason?: string };

const SOURCE_TYPES: TrustSourceType[] = [
  'relay',
  'curator',
  'list',
  'algorithmic',
  'atproto-labeler',
  'domain-blocklist',
  'fediseer'
];

const TRUST_SCOPES: TrustScope[] = [
  'filter:content',
  'filter:actor',
  'label:content',
  'label:actor',
  'rank:down',
  'rank:up'
];

const SCOPE_LABELS: Record<TrustScope, string> = {
  'filter:content': 'Filter content',
  'filter:actor': 'Filter actor',
  'label:content': 'Label content',
  'label:actor': 'Label actor',
  'rank:down': 'Downrank',
  'rank:up': 'Uprank'
};

const SOURCE_TYPE_LABELS: Record<TrustSourceType, string> = {
  relay: 'Relay',
  curator: 'Curator',
  list: 'List',
  algorithmic: 'Algorithmic',
  'atproto-labeler': 'ATProto Labeler',
  'domain-blocklist': 'Domain Blocklist',
  fediseer: 'Fediseer'
};

const MODE_LABELS: Record<MRFMode, string> = {
  disabled: 'Disabled',
  'dry-run': 'Dry run',
  enforce: 'Enforce'
};

const scopeDependencyError = (scopes: Set<TrustScope>): string | null => {
  if (scopes.has('filter:content') && !scopes.has('label:content')) {
    return 'filter:content requires label:content';
  }
  if (scopes.has('filter:actor') && !scopes.has('label:actor')) {
    return 'filter:actor requires label:actor';
  }
  return null;
};

const resourceId = (item: Partial<TrustSource>) => item['@id'] || item.id || '';

const scalarValue = (value: JsonLdScalar) => {
  if (value && typeof value === 'object' && '@value' in value) {
    return value['@value'];
  }
  return value;
};

const normalizeBoolean = (value: JsonLdScalar) => scalarValue(value) === true || scalarValue(value) === 'true';

const normalizeNumber = (value: JsonLdScalar, fallback: number) => {
  const scalar = scalarValue(value);
  const numeric = typeof scalar === 'number' ? scalar : Number(scalar);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeTrustSource = (item: any): TrustSource => ({
  ...item,
  '@id': item['@id'] || item.id,
  enabled: normalizeBoolean(item.enabled),
  weight: normalizeNumber(item.weight, 1),
  priority: item.priority !== undefined ? normalizeNumber(item.priority as JsonLdScalar, 0) : undefined,
  schemaVersion: normalizeNumber(item.schemaVersion, 1)
});

const isDid = (value: string) => /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/i.test(value.trim());

const isLikelyDomain = (value: string) =>
  /^(\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value.trim());

const parseBlocklistText = (input: string): ParsedBlocklist[] => {
  const lines = input
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !line.startsWith('#') && !line.startsWith('//'));

  const parsed: ParsedBlocklist[] = [];

  for (const line of lines) {
    // Mastodon style CSV-ish: domain,severity,public_comment,private_comment,reject_media,reject_reports,obfuscate
    if (line.includes(',')) {
      const parts = line.split(',').map(part => part.trim());
      const domain = parts[0];
      if (isLikelyDomain(domain) || domain.startsWith('http://') || domain.startsWith('https://')) {
        parsed.push({ source: domain, reason: parts[2] || parts[1] });
        continue;
      }
    }

    // Akkoma/Pleroma tuple-like snippets: {"example.com", "reason"}
    const tupleMatch = line.match(/\{\s*"([^"]+)"\s*,\s*"([^"]*)"\s*\}/);
    if (tupleMatch) {
      parsed.push({ source: tupleMatch[1], reason: tupleMatch[2] || undefined });
      continue;
    }

    // Plain domain list line
    if (isLikelyDomain(line) || line.startsWith('http://') || line.startsWith('https://')) {
      parsed.push({ source: line });
    }
  }

  const uniq = new Map<string, ParsedBlocklist>();
  parsed.forEach(item => {
    uniq.set(item.source.toLowerCase(), item);
  });

  return [...uniq.values()];
};

const downloadBlob = (filename: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const TrustSourcesPage = () => {
  const [sources, setSources] = useState<TrustSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [source, setSource] = useState('');
  const [sourceType, setSourceType] = useState<TrustSourceType>('list');
  const [labelerHandle, setLabelerHandle] = useState('');
  const [resolvingHandle, setResolvingHandle] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<TrustScope>>(new Set(['label:content', 'filter:content']));
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});

  const [previewMeta, setPreviewMeta] = useState<PreviewMeta>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [editingItem, setEditingItem] = useState<TrustSource | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editScopes, setEditScopes] = useState<Set<TrustScope>>(new Set());

  const [trustEvalMode, setTrustEvalMode] = useState<MRFMode>('dry-run');
  const [trustEvalRevision, setTrustEvalRevision] = useState<number | null>(null);
  const [trustEvalLoading, setTrustEvalLoading] = useState(false);
  const [trustEvalSaving, setTrustEvalSaving] = useState(false);
  const [defaultModerationSource, setDefaultModerationSource] = useState<{
    source?: string;
    immutable?: boolean;
  } | null>(null);

  const [blocklistInput, setBlocklistInput] = useState('');
  const [importingBlocklist, setImportingBlocklist] = useState(false);

  const createScopeError = useMemo(() => scopeDependencyError(selectedScopes), [selectedScopes]);
  const editScopeError = useMemo(() => scopeDependencyError(editScopes), [editScopes]);

  const parsedImport = useMemo(() => parseBlocklistText(blocklistInput), [blocklistInput]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.list('trust-sources');
      const items = ((res.data || []) as any[]).map(normalizeTrustSource);
      setSources(items);
      setDraftWeights(
        Object.fromEntries(items.map(item => [resourceId(item), typeof item.weight === 'number' ? item.weight : 1]))
      );
    } catch (e: any) {
      setError(e.message || 'Failed to load trust sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    let active = true;
    dashboardApi
      .getProviderDefaultModerationSourceStatus()
      .then(result => {
        if (!active) return;
        setDefaultModerationSource(result?.data || null);
      })
      .catch(() => {
        if (!active) return;
        setDefaultModerationSource(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const loadTrustEvaluatorMode = useCallback(async () => {
    setTrustEvalLoading(true);
    try {
      const moduleRes = await dashboardApi.getMrfModule('trust-eval');
      const config = moduleRes?.data?.config;
      const mode = config?.mode;

      if (mode === 'disabled' || mode === 'dry-run' || mode === 'enforce') {
        setTrustEvalMode(mode);
      }

      if (typeof config?.revision === 'number') {
        setTrustEvalRevision(config.revision);
      }
    } catch {
      setTrustEvalRevision(null);
    } finally {
      setTrustEvalLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrustEvaluatorMode();
  }, [loadTrustEvaluatorMode]);

  const handleTrustEvalModeChange = async (nextMode: MRFMode) => {
    if (trustEvalSaving) return;

    setTrustEvalSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { mode: nextMode };
      if (typeof trustEvalRevision === 'number') {
        payload.expectedRevision = trustEvalRevision;
      }

      const patchRes = await dashboardApi.patchMrfModule('trust-eval', payload);
      const nextRevision = patchRes?.data?.revision;
      if (typeof nextRevision === 'number') {
        setTrustEvalRevision(nextRevision);
      }
      setTrustEvalMode(nextMode);
    } catch (e: any) {
      setError(e?.message || 'Failed to update trust evaluator mode');
      await loadTrustEvaluatorMode();
    } finally {
      setTrustEvalSaving(false);
    }
  };

  const sortedSources = useMemo(
    () =>
      [...sources].sort(
        (a, b) =>
          Number(b.enabled) - Number(a.enabled) || (b.priority ?? -1) - (a.priority ?? -1) || b.weight - a.weight
      ),
    [sources]
  );

  const toggleScope = (scope: TrustScope) => {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const handleCreate = async () => {
    if (source.trim().length === 0 || selectedScopes.size === 0) return;
    if (createScopeError) {
      setError(createScopeError);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        source: source.trim(),
        sourceType,
        name: name.trim().length > 0 ? name.trim() : undefined,
        description: description.trim().length > 0 ? description.trim() : undefined,
        enabled: true,
        weight: 1,
        scopes: Array.from(selectedScopes)
      };

      if (sourceType === 'atproto-labeler' && isDid(source.trim()) && name.trim().length === 0) {
        payload.name = `ATProto labeler ${source.trim()}`;
      }

      await dashboardApi.create('trust-sources', payload);

      setSource('');
      setName('');
      setDescription('');
      setSourceType('list');
      setSelectedScopes(new Set(['label:content', 'filter:content']));
      setPreviewMeta(null);

      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to add trust source');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEnabled = async (item: TrustSource, enabled: boolean) => {
    try {
      await dashboardApi.patch(item['@id'], { enabled });
      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to update trust source');
    }
  };

  const handleWeightCommit = async (item: TrustSource, weight: number) => {
    try {
      await dashboardApi.patch(item['@id'], { weight });
      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to update weight');
    }
  };

  const handleDelete = async (uri: string) => {
    try {
      await dashboardApi.remove(uri);
      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to remove trust source');
    }
  };

  const openEdit = (item: TrustSource) => {
    setEditingItem(item);
    setEditName(item.name || '');
    setEditPriority(item.priority !== undefined ? String(item.priority) : '');
    const rawScopes = item.scopes || [];
    setEditScopes(new Set(rawScopes.map(s => String(scalarValue(s as JsonLdScalar))) as TrustScope[]));
  };

  const handleEditSave = async () => {
    if (!editingItem) return;
    if (editScopeError) {
      setError(editScopeError);
      return;
    }

    setSaving(true);
    try {
      const uri = resourceId(editingItem);
      const patch: Record<string, unknown> = { scopes: Array.from(editScopes) };
      if (editName.trim().length > 0) patch.name = editName.trim();
      if (editPriority.trim().length > 0) {
        const p = Number(editPriority);
        if (Number.isFinite(p) && p >= 0) patch.priority = p;
      }

      await dashboardApi.patch(uri, patch);
      setEditingItem(null);
      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleFetchPreview = async () => {
    if (!source.trim()) return;
    setPreviewLoading(true);
    setPreviewMeta(null);

    try {
      const res = await dashboardApi.previewSource(source.trim());
      setPreviewMeta(res);
      if (res.name && name.trim().length === 0) {
        setName(res.name);
      }
      if (res.description && description.trim().length === 0) {
        setDescription(res.description);
      }
    } catch (e: any) {
      setError(e.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const resolveLabelerHandle = async () => {
    if (!labelerHandle.trim()) return;
    setResolvingHandle(true);
    setError(null);

    try {
      const result = await dashboardApi.resolveAtprotoHandle(labelerHandle.trim(), source.trim() || undefined);
      const did = String(result?.data?.did || '').trim();
      if (!did) throw new Error('Resolve response did not include DID');

      setSource(did);
      if (name.trim().length === 0) {
        setName(`ATProto labeler ${labelerHandle.trim().toLowerCase()}`);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to resolve ATProto handle');
    } finally {
      setResolvingHandle(false);
    }
  };

  const handleImportBlocklist = async () => {
    if (parsedImport.length === 0) return;

    setImportingBlocklist(true);
    setError(null);
    try {
      const existing = new Set(
        sources.filter(item => item.sourceType === 'domain-blocklist').map(item => item.source.toLowerCase())
      );

      for (const item of parsedImport) {
        if (existing.has(item.source.toLowerCase())) {
          continue;
        }

        await dashboardApi.create('trust-sources', {
          source: item.source,
          sourceType: 'domain-blocklist',
          name: item.reason ? `Domain block: ${item.source}` : undefined,
          description: item.reason,
          enabled: true,
          weight: 1,
          scopes: ['label:actor', 'filter:actor']
        });
      }

      setBlocklistInput('');
      await loadSources();
    } catch (e: any) {
      setError(e.message || 'Failed to import blocklist entries');
    } finally {
      setImportingBlocklist(false);
    }
  };

  const exportDomainBlocklistTxt = () => {
    const lines = sortedSources.filter(item => item.sourceType === 'domain-blocklist').map(item => item.source);

    downloadBlob('domain-blocklist.txt', `${lines.join('\n')}\n`, 'text/plain;charset=utf-8');
  };

  const exportDomainBlocklistCsv = () => {
    const rows = sortedSources
      .filter(item => item.sourceType === 'domain-blocklist')
      .map(item => {
        const comment = item.description || '';
        return `${item.source},suspend,${JSON.stringify(comment).slice(1, -1)}`;
      });

    const header = 'domain,severity,public_comment';
    downloadBlob('domain-blocklist.csv', `${header}\n${rows.join('\n')}\n`, 'text/csv;charset=utf-8');
  };

  const sourceFieldLabel =
    sourceType === 'atproto-labeler'
      ? 'ATProto labeler DID or declaration URL'
      : sourceType === 'domain-blocklist'
        ? 'Domain, wildcard domain, or blocklist URL'
        : sourceType === 'fediseer'
          ? 'Fediseer issuer domain or instance URL'
        : 'Source URL';

  return (
    <>
      <Box p={3}>
        <Typography variant="h5" gutterBottom>
          Trust Sources
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Manage external moderation and ranking signals, including ATProto labelers, Fediseer issuers, and domain
          blocklists.
        </Typography>

        <Box
          sx={{
            mb: 2,
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            bgcolor: 'background.paper'
          }}
        >
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <Box flex={1}>
              <Typography variant="subtitle2">Trust Evaluator Mode</Typography>
              <Typography variant="caption" color="text.secondary">
                Controls whether trust signals are simulated or actively enforced.
              </Typography>
            </Box>
            <Select
              size="small"
              value={trustEvalMode}
              disabled={trustEvalLoading || trustEvalSaving}
              onChange={e => handleTrustEvalModeChange(e.target.value as MRFMode)}
            >
              {(Object.keys(MODE_LABELS) as MRFMode[]).map(mode => (
                <MenuItem key={mode} value={mode}>
                  {MODE_LABELS[mode]}
                </MenuItem>
              ))}
            </Select>
          </Stack>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {loading && <CircularProgress size={20} />}

        {loading === false && sortedSources.length === 0 && (
          <Typography variant="body2" color="text.secondary" mb={2}>
            No trust sources installed yet.
          </Typography>
        )}

        <List disablePadding>
          {sortedSources.map(item => {
            const uri = resourceId(item);
            const currentWeight = draftWeights[uri] ?? item.weight ?? 1;
            const immutableDefault = Boolean(
              defaultModerationSource?.immutable &&
                defaultModerationSource?.source &&
                String(item.source || '').toLowerCase() === String(defaultModerationSource.source).toLowerCase()
            );

            return (
              <ListItem key={uri} divider alignItems="flex-start" sx={{ py: 1.5 }}>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography variant="body1" fontWeight={500}>
                        {item.name || item.source}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={SOURCE_TYPE_LABELS[item.sourceType] || item.sourceType}
                      />
                      {immutableDefault && (
                        <Chip size="small" color="warning" variant="outlined" label="Default (immutable)" />
                      )}
                      <Chip
                        size="small"
                        color={item.enabled ? 'success' : 'default'}
                        label={item.enabled ? 'Enabled' : 'Disabled'}
                      />
                      {item.priority !== undefined && (
                        <Chip size="small" variant="outlined" color="primary" label={`Priority ${item.priority}`} />
                      )}
                    </Stack>
                  }
                  secondary={
                    <Stack spacing={1} mt={1}>
                      <Typography variant="caption" color="text.secondary">
                        {item.source}
                      </Typography>
                      <Stack direction="row" flexWrap="wrap" gap={0.5}>
                        {(item.scopes || []).map(scope => (
                          <Chip
                            key={scope}
                            label={SCOPE_LABELS[scope as TrustScope] || scope}
                            variant="outlined"
                            size="small"
                          />
                        ))}
                      </Stack>
                      <Stack direction="row" spacing={2} alignItems="center">
                        <FormControlLabel
                          control={
                            <Switch
                              checked={item.enabled}
                              onChange={e => handleToggleEnabled(item, e.target.checked)}
                              disabled={immutableDefault}
                            />
                          }
                          label="Enabled"
                        />
                        <Box minWidth={180}>
                          <Typography variant="caption" color="text.secondary">
                            Weight: {currentWeight.toFixed(2)}
                          </Typography>
                          <Slider
                            size="small"
                            min={0}
                            max={1}
                            step={0.05}
                            value={currentWeight}
                            onChange={(_, value) => {
                              const nextValue = Array.isArray(value) ? value[0] : value;
                              setDraftWeights(prev => ({ ...prev, [uri]: nextValue }));
                            }}
                            onChangeCommitted={(_, value) => {
                              const nextValue = Array.isArray(value) ? value[0] : value;
                              if (!immutableDefault) {
                                handleWeightCommit(item, nextValue);
                              }
                            }}
                            disabled={immutableDefault}
                          />
                        </Box>
                      </Stack>
                    </Stack>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Edit scopes / name">
                    <IconButton edge="end" size="small" onClick={() => openEdit(item)} sx={{ mr: 0.5 }}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Remove trust source">
                    <IconButton
                      edge="end"
                      size="small"
                      sx={{ color: 'error.main' }}
                      onClick={() => handleDelete(uri)}
                      disabled={immutableDefault}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            );
          })}
        </List>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Typography variant="subtitle1" fontWeight={500} gutterBottom>
            Add a trust source
          </Typography>

          <Stack spacing={2}>
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Source type
              </Typography>
              <Select
                size="small"
                value={sourceType}
                onChange={e => {
                  const nextType = e.target.value as TrustSourceType;
                  setSourceType(nextType);
                  if (nextType === 'fediseer') {
                    setSelectedScopes(new Set(['label:actor', 'filter:actor']));
                  }
                }}
              >
                {SOURCE_TYPES.map(type => (
                  <MenuItem key={type} value={type}>
                    {SOURCE_TYPE_LABELS[type]}
                  </MenuItem>
                ))}
              </Select>
            </Box>

            <TextField
              size="small"
              label={sourceFieldLabel}
              value={source}
              onChange={e => {
                setSource(e.target.value);
                setPreviewMeta(null);
              }}
              placeholder={
                sourceType === 'atproto-labeler'
                  ? 'did:plc:xxxx... or https://labeler.example/.well-known/did.json'
                  : sourceType === 'domain-blocklist'
                    ? 'example.org or *.example.org or https://example.org/blocklist.txt'
                    : sourceType === 'fediseer'
                      ? 'beehaw.org or https://beehaw.org'
                    : 'https://example.org/moderation/list'
              }
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Fetch metadata preview">
                      <span>
                        <IconButton
                          size="small"
                          onClick={handleFetchPreview}
                          disabled={
                            source.trim().length === 0 ||
                            previewLoading ||
                            sourceType === 'domain-blocklist' ||
                            sourceType === 'fediseer'
                          }
                        >
                          {previewLoading ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                )
              }}
            />

            {sourceType === 'atproto-labeler' && (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  size="small"
                  label="Resolve from handle"
                  value={labelerHandle}
                  onChange={e => setLabelerHandle(e.target.value)}
                  placeholder="mod.example.bsky.social"
                  fullWidth
                />
                <Button
                  variant="outlined"
                  onClick={resolveLabelerHandle}
                  disabled={resolvingHandle || labelerHandle.trim().length === 0}
                >
                  {resolvingHandle ? 'Resolving…' : 'Resolve DID'}
                </Button>
              </Stack>
            )}

            {previewMeta && (
              <Box
                sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'action.hover' }}
              >
                {previewMeta.icon && (
                  <Box
                    component="img"
                    src={previewMeta.icon}
                    alt=""
                    sx={{ width: 32, height: 32, mb: 1, borderRadius: 1 }}
                  />
                )}
                {previewMeta.name && (
                  <Typography variant="body2" fontWeight={500}>
                    {previewMeta.name}
                  </Typography>
                )}
                {previewMeta.description && (
                  <Typography variant="caption" color="text.secondary">
                    {previewMeta.description.slice(0, 200)}
                  </Typography>
                )}
              </Box>
            )}

            <TextField
              size="small"
              label="Display name (optional)"
              value={name}
              onChange={e => setName(e.target.value)}
              fullWidth
            />

            <TextField
              size="small"
              label="Description (optional)"
              value={description}
              onChange={e => setDescription(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />

            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Scopes to grant
              </Typography>
              {createScopeError && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  {createScopeError} - please enable the required labeling scope.
                </Alert>
              )}
              <FormGroup>
                {TRUST_SCOPES.map(scope => (
                  <FormControlLabel
                    key={scope}
                    control={
                      <Checkbox size="small" checked={selectedScopes.has(scope)} onChange={() => toggleScope(scope)} />
                    }
                    label={SCOPE_LABELS[scope]}
                  />
                ))}
              </FormGroup>
            </Box>

            <Button
              variant="contained"
              disabled={source.trim().length === 0 || selectedScopes.size === 0 || Boolean(createScopeError) || saving}
              onClick={handleCreate}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add trust source
            </Button>
          </Stack>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} mb={1}>
            <Typography variant="subtitle1" fontWeight={500}>
              Domain Blocklist Import / Export
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={exportDomainBlocklistTxt}
              >
                Export TXT
              </Button>
              <Button
                size="small"
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={exportDomainBlocklistCsv}
              >
                Export CSV
              </Button>
            </Stack>
          </Stack>

          <Typography variant="body2" color="text.secondary" mb={1}>
            Paste domains from Mastodon or Akkoma lists. Supported input: plain domains, wildcard domains, CSV rows, or
            tuple lines.
          </Typography>

          <TextField
            fullWidth
            multiline
            minRows={6}
            placeholder={'spam.example\n*.badhost.tld\nexample.org,suspend,spam source\n{"host.example", "reason"}'}
            value={blocklistInput}
            onChange={e => setBlocklistInput(e.target.value)}
          />

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }} mt={1.5}>
            <Typography variant="caption" color="text.secondary">
              Parsed entries: {parsedImport.length}
            </Typography>
            <Button
              variant="contained"
              size="small"
              startIcon={<FileUploadIcon />}
              disabled={parsedImport.length === 0 || importingBlocklist}
              onClick={handleImportBlocklist}
            >
              Import as domain blocklist sources
            </Button>
          </Stack>
        </Box>
      </Box>

      <Dialog open={editingItem !== null} onClose={() => setEditingItem(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit trust source</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              size="small"
              label="Display name"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              fullWidth
            />
            <TextField
              size="small"
              label="Priority (optional)"
              value={editPriority}
              onChange={e => setEditPriority(e.target.value)}
              fullWidth
            />
            {editScopeError && <Alert severity="warning">{editScopeError}</Alert>}
            <FormGroup>
              {TRUST_SCOPES.map(scope => (
                <FormControlLabel
                  key={scope}
                  control={
                    <Checkbox
                      size="small"
                      checked={editScopes.has(scope)}
                      onChange={() => {
                        setEditScopes(prev => {
                          const next = new Set(prev);
                          if (next.has(scope)) {
                            next.delete(scope);
                          } else {
                            next.add(scope);
                          }
                          return next;
                        });
                      }}
                    />
                  }
                  label={SCOPE_LABELS[scope]}
                />
              ))}
            </FormGroup>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingItem(null)}>Cancel</Button>
          <Button onClick={handleEditSave} disabled={saving || Boolean(editScopeError)} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TrustSourcesPage;
