import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
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

type TrustSourceType = 'relay' | 'curator' | 'list' | 'algorithmic';
type TrustScope = 'filter:content' | 'filter:actor' | 'label:content' | 'label:actor' | 'rank:down' | 'rank:up';

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

const SOURCE_TYPES: TrustSourceType[] = ['relay', 'curator', 'list', 'algorithmic'];
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
  algorithmic: 'Algorithmic'
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

type PreviewMeta = { name?: string; description?: string; icon?: string } | null;

const TrustSourcesPage = () => {
  const [sources, setSources] = useState<TrustSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('');
  const [sourceType, setSourceType] = useState<TrustSourceType>('list');
  const [name, setName] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<TrustScope>>(new Set(['filter:content']));
  const [draftWeights, setDraftWeights] = useState<Record<string, number>>({});
  const [previewMeta, setPreviewMeta] = useState<PreviewMeta>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [editingItem, setEditingItem] = useState<TrustSource | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editScopes, setEditScopes] = useState<Set<TrustScope>>(new Set());

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

  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => Number(b.enabled) - Number(a.enabled) || b.weight - a.weight),
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
    setSaving(true);
    try {
      await dashboardApi.create('trust-sources', {
        source: source.trim(),
        sourceType,
        name: name.trim().length > 0 ? name.trim() : undefined,
        enabled: true,
        weight: 1,
        scopes: Array.from(selectedScopes)
      });
      setSource('');
      setName('');
      setSourceType('list');
      setSelectedScopes(new Set(['filter:content']));
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
    const uri = resourceId(editingItem);
    setSaving(true);
    try {
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
      if (res.name && name.trim().length === 0) setName(res.name);
    } catch (e: any) {
      setError(e.message || 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <Box p={3}>
        <Typography variant="h5" gutterBottom>
          Trust Sources
        </Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Manage the external sources your Pod can trust for filtering, labeling, and ranking decisions.
        </Typography>

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
                      <Chip
                        size="small"
                        color={item.enabled ? 'success' : 'default'}
                        label={item.enabled ? 'Enabled' : 'Disabled'}
                      />
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
                            />
                          }
                          label="Enabled"
                        />
                        <Box minWidth={180}>
                          <Typography variant="caption" color="text.secondary">
                            Weight: {currentWeight.toFixed(2)}                          {item.priority !== undefined ? ` · Priority: ${item.priority}` : ''}                          </Typography>
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
                              handleWeightCommit(item, nextValue);
                            }}
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
                    <IconButton edge="end" size="small" sx={{ color: 'error.main' }} onClick={() => handleDelete(uri)}>
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
            <TextField
              size="small"
              label="Source URL"
              value={source}
              onChange={e => {
                setSource(e.target.value);
                setPreviewMeta(null);
              }}
              placeholder="https://example.org/moderation/list"
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Fetch metadata preview">
                      <span>
                        <IconButton
                          size="small"
                          onClick={handleFetchPreview}
                          disabled={source.trim().length === 0 || previewLoading}
                        >
                          {previewLoading ? <CircularProgress size={16} /> : <SearchIcon fontSize="small" />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </InputAdornment>
                )
              }}
            />
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
                {!previewMeta.name && !previewMeta.description && (
                  <Typography variant="caption" color="text.secondary">
                    No preview metadata found for this URL.
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
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Source type
              </Typography>
              <Select size="small" value={sourceType} onChange={e => setSourceType(e.target.value as TrustSourceType)}>
                {SOURCE_TYPES.map(type => (
                  <MenuItem key={type} value={type}>
                    {SOURCE_TYPE_LABELS[type]}
                  </MenuItem>
                ))}
              </Select>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Scopes to grant
              </Typography>
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
              disabled={source.trim().length === 0 || selectedScopes.size === 0 || saving}
              onClick={handleCreate}
              sx={{ alignSelf: 'flex-start' }}
            >
              Add trust source
            </Button>
          </Stack>
        </Box>
      </Box>

      {/* Edit dialog */}
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
              label="Priority (optional, non-negative integer)"
              value={editPriority}
              onChange={e => setEditPriority(e.target.value)}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
              fullWidth
            />
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Scopes
              </Typography>
              {editScopes.has('filter:content') && !editScopes.has('label:content') && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  filter:content requires label:content — please enable it too.
                </Alert>
              )}
              {editScopes.has('filter:actor') && !editScopes.has('label:actor') && (
                <Alert severity="warning" sx={{ mb: 1 }}>
                  filter:actor requires label:actor — please enable it too.
                </Alert>
              )}
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
                            if (next.has(scope)) next.delete(scope);
                            else next.add(scope);
                            return next;
                          });
                        }}
                      />
                    }
                    label={SCOPE_LABELS[scope]}
                  />
                ))}
              </FormGroup>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingItem(null)}>Cancel</Button>
          <Button variant="contained" disabled={editScopes.size === 0 || saving} onClick={handleEditSave}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TrustSourcesPage;
