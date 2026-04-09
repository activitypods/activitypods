import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  Checkbox
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type MRFMode = 'disabled' | 'dry-run' | 'enforce';

type UIFieldType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'enum'
  | 'multiselect'
  | 'string-array'
  | 'json';

type RegistryFieldOption = {
  value: string;
  label: string;
  description?: string;
};

type RegistryFieldDescriptor = {
  key: string;
  label: string;
  description?: string;
  type: UIFieldType;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    required?: boolean;
  };
  defaultValue?: unknown;
  options?: RegistryFieldOption[];
  secret?: boolean;
  advanced?: boolean;
  placeholder?: string;
  examples?: unknown[];
};

type RegistryModuleDescriptor = {
  manifest: {
    id: string;
    name: string;
    description?: string;
    allowedActions: string[];
    defaultMode: MRFMode;
    defaultPriority: number;
    version: string;
    configSchemaVersion: number;
  };
  ui: {
    category: string;
    shortDescription?: string;
    docsUrl?: string;
    supportsSimulator: boolean;
    supportsDryRun: boolean;
    supportsEnforce: boolean;
    supportsStopOnMatch: boolean;
    warnings?: string[];
  };
  config: {
    fields: RegistryFieldDescriptor[];
    defaults: Record<string, unknown>;
    invariants: Array<{ code: string; message: string }>;
  };
  safety: {
    disallowModes?: MRFMode[];
    requireSimulatorBeforeEnforce?: boolean;
    enforceGuardrails?: string[];
  };
};

type ModuleConfigState = {
  enabled: boolean;
  mode: MRFMode;
  priority: number;
  stopOnMatch: boolean;
  config: Record<string, unknown>;
  revision: number;
};

type ModulesListItem = {
  manifest: RegistryModuleDescriptor['manifest'];
  config: ModuleConfigState | null;
};

type ApiError = Error & { code?: string; status?: number; details?: unknown; requestId?: string };

type TuningSuggestion = {
  field: string;
  type: 'increase' | 'decrease' | 'toggle' | 'add' | 'remove';
  suggestedValue: unknown;
  rationale: string;
};

type TuningContext = {
  moduleId: string;
  traceId: string;
  activityId?: string;
  suggestions: TuningSuggestion[];
};

const MODE_LABELS: Record<MRFMode, string> = {
  disabled: 'Disabled',
  'dry-run': 'Dry run',
  enforce: 'Enforce'
};

const parseArrayInput = (value: unknown) => {
  if (Array.isArray(value)) return value.map(v => String(v));
  if (typeof value === 'string') {
    return value
      .split('\n')
      .map(v => v.trim())
      .filter(Boolean);
  }
  return [];
};

const ensureBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
};

const ensureNumber = (value: unknown, fallback = 0) => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const toFriendlyError = (message?: string, fallback?: string) => {
  if (!message || !message.trim()) return fallback || 'Something went wrong.';

  const normalized = message.trim();
  if (normalized.toLowerCase().includes('mrf control plane is not configured')) {
    return 'Post filtering is not set up yet. Connect the filtering service to start using this page.';
  }

  return normalized;
};

const MrfControlPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { moduleId: moduleIdFromRoute } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverWarnings, setServerWarnings] = useState<string[]>([]);

  const [modules, setModules] = useState<ModulesListItem[]>([]);
  const [activeModuleId, setActiveModuleId] = useState<string>('');
  const [descriptor, setDescriptor] = useState<RegistryModuleDescriptor | null>(null);
  const [moduleState, setModuleState] = useState<ModuleConfigState | null>(null);

  const [formValues, setFormValues] = useState<Record<string, unknown>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [mode, setMode] = useState<MRFMode>('dry-run');
  const [enabled, setEnabled] = useState(true);
  const [priority, setPriority] = useState<number>(0);
  const [stopOnMatch, setStopOnMatch] = useState(false);
  const [revision, setRevision] = useState<number>(0);
  const [confirmEnforceRisk, setConfirmEnforceRisk] = useState(false);
  const [tuningContext, setTuningContext] = useState<TuningContext | null>(null);

  const loadModuleLists = useCallback(async () => {
    const [registryRes, modulesRes] = await Promise.all([dashboardApi.listMrfRegistry(), dashboardApi.listMrfModules()]);
    const registryItems = (registryRes.data || []) as RegistryModuleDescriptor[];
    const moduleItems = (modulesRes.data || []) as ModulesListItem[];

    setModules(moduleItems);

    const nextActive =
      moduleIdFromRoute ||
      moduleItems[0]?.manifest?.id ||
      registryItems[0]?.manifest?.id ||
      '';

    setActiveModuleId(nextActive);
    if (nextActive && !moduleIdFromRoute) {
      navigate(`/settings/mrf/${encodeURIComponent(nextActive)}`, { replace: true });
    }
  }, [moduleIdFromRoute, navigate]);

  const loadModuleEditor = useCallback(async (moduleId: string) => {
    const [registryRes, moduleRes] = await Promise.all([
      dashboardApi.getMrfRegistryItem(moduleId),
      dashboardApi.getMrfModule(moduleId)
    ]);

    const nextDescriptor = registryRes.data as RegistryModuleDescriptor;
    const nextModuleConfig = moduleRes.data?.config as ModuleConfigState | null;

    setDescriptor(nextDescriptor);
    setModuleState(nextModuleConfig);

    const nextConfig = { ...(nextDescriptor.config.defaults || {}), ...(nextModuleConfig?.config || {}) };
    setFormValues(nextConfig);
    setFieldErrors({});
    setServerWarnings([]);

    setMode((nextModuleConfig?.mode as MRFMode) || nextDescriptor.manifest.defaultMode || 'dry-run');
    setEnabled(ensureBoolean(nextModuleConfig?.enabled, true));
    setPriority(ensureNumber(nextModuleConfig?.priority, nextDescriptor.manifest.defaultPriority || 0));
    setStopOnMatch(ensureBoolean(nextModuleConfig?.stopOnMatch, false));
    setRevision(ensureNumber(nextModuleConfig?.revision, 0));
    setConfirmEnforceRisk(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rawTune = params.get('tune');

    if (!rawTune) {
      setTuningContext(null);
      return;
    }

    try {
      const parsed = JSON.parse(rawTune) as TuningContext;
      if (!parsed || typeof parsed !== 'object') {
        setTuningContext(null);
        return;
      }

      const validSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
      setTuningContext({
        moduleId: String(parsed.moduleId || ''),
        traceId: String(parsed.traceId || ''),
        activityId: parsed.activityId ? String(parsed.activityId) : undefined,
        suggestions: validSuggestions
      });
    } catch {
      setTuningContext(null);
    }
  }, [location.search]);

  useEffect(() => {
    let isMounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadModuleLists();
      } catch (e: any) {
        if (!isMounted) return;
        setError(toFriendlyError(e.message, 'Could not load post filters.'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [loadModuleLists]);

  useEffect(() => {
    if (!activeModuleId) return;

    let isMounted = true;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        await loadModuleEditor(activeModuleId);
      } catch (e: any) {
        if (!isMounted) return;
        setError(toFriendlyError(e.message, 'Could not load post filter settings.'));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    run();
    return () => {
      isMounted = false;
    };
  }, [activeModuleId, loadModuleEditor]);

  const disallowedModes = useMemo(() => new Set(descriptor?.safety?.disallowModes || []), [descriptor]);

  const handleSelectModule = (moduleId: string) => {
    setActiveModuleId(moduleId);
    navigate(`/settings/mrf/${encodeURIComponent(moduleId)}`);
  };

  const setFieldValue = (key: string, value: unknown) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  const validateField = (field: RegistryFieldDescriptor, value: unknown): string | null => {
    const constraints = field.constraints || {};

    if (constraints.required) {
      if (value === undefined || value === null || value === '') return 'Required';
      if (Array.isArray(value) && value.length === 0) return 'Required';
    }

    if ((field.type === 'number' || field.type === 'integer') && value !== undefined && value !== null && value !== '') {
      const n = Number(value);
      if (!Number.isFinite(n)) return 'Must be a number';
      if (field.type === 'integer' && !Number.isInteger(n)) return 'Must be an integer';
      if (constraints.min !== undefined && n < constraints.min) return `Must be >= ${constraints.min}`;
      if (constraints.max !== undefined && n > constraints.max) return `Must be <= ${constraints.max}`;
    }

    if (field.type === 'string' && typeof value === 'string') {
      if (constraints.minLength !== undefined && value.length < constraints.minLength)
        return `Min length is ${constraints.minLength}`;
      if (constraints.maxLength !== undefined && value.length > constraints.maxLength)
        return `Max length is ${constraints.maxLength}`;
      if (constraints.pattern) {
        try {
          if (!new RegExp(constraints.pattern).test(value)) return 'Invalid format';
        } catch {
          return null;
        }
      }
    }

    if (field.type === 'json' && typeof value === 'string' && value.trim().length > 0) {
      try {
        JSON.parse(value);
      } catch {
        return 'Invalid JSON';
      }
    }

    return null;
  };

  const validateAllFields = () => {
    if (!descriptor) return false;

    const nextErrors: Record<string, string> = {};
    for (const field of descriptor.config.fields) {
      const err = validateField(field, formValues[field.key]);
      if (err) nextErrors[field.key] = err;
    }

    if (mode === 'enforce' && descriptor.safety?.requireSimulatorBeforeEnforce && !confirmEnforceRisk) {
      nextErrors.__mode = 'Confirm simulator/enforce risk acknowledgment before saving enforce mode';
    }

    if (disallowedModes.has(mode)) {
      nextErrors.__mode = 'Selected mode is disallowed for this filter';
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildConfigPayload = () => {
    if (!descriptor) return {};

    const output: Record<string, unknown> = {};

    for (const field of descriptor.config.fields) {
      const raw = formValues[field.key];

      if (field.type === 'number' || field.type === 'integer') {
        if (raw === '' || raw === undefined || raw === null) continue;
        const n = Number(raw);
        output[field.key] = field.type === 'integer' ? Math.trunc(n) : n;
        continue;
      }

      if (field.type === 'boolean') {
        output[field.key] = ensureBoolean(raw);
        continue;
      }

      if (field.type === 'multiselect') {
        output[field.key] = Array.isArray(raw) ? raw : [];
        continue;
      }

      if (field.type === 'string-array') {
        output[field.key] = parseArrayInput(raw);
        continue;
      }

      if (field.type === 'json') {
        if (typeof raw === 'string') {
          output[field.key] = raw.trim().length > 0 ? JSON.parse(raw) : {};
        } else {
          output[field.key] = raw ?? {};
        }
        continue;
      }

      output[field.key] = raw;
    }

    return output;
  };

  const handleSave = async () => {
    if (!descriptor || !activeModuleId || !validateAllFields()) return;

    setSaving(true);
    setError(null);
    setServerWarnings([]);

    try {
      const payload = {
        enabled,
        mode,
        priority,
        stopOnMatch,
        config: buildConfigPayload(),
        expectedRevision: revision
      };

      const res = await dashboardApi.patchMrfModule(activeModuleId, payload);
      setRevision(ensureNumber(res?.data?.revision, revision));
      setServerWarnings(Array.isArray(res?.warnings) ? res.warnings : []);
      await loadModuleEditor(activeModuleId);

      if (tuningContext?.activityId) {
        const shouldSimulate = window.confirm('Configuration saved. Run simulation for the tuned activity now?');
        if (shouldSimulate) {
          await dashboardApi.createMrfSimulation({ activityId: tuningContext.activityId });
        }
      }
    } catch (e: any) {
      const err = e as ApiError;
      if (err.code === 'CONFLICT' || err.status === 409) {
        setError('This filter changed in another session. We reloaded the latest version. Please review and save again.');
        await loadModuleEditor(activeModuleId);
      } else if (err.code === 'BAD_REQUEST' && err.details && typeof err.details === 'object') {
        setError(toFriendlyError(err.message, 'Please review the highlighted fields and try again.'));
      } else {
        setError(toFriendlyError(err.message, 'Could not save filter settings.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleApplySuggestion = (suggestion: TuningSuggestion) => {
    if (!suggestion?.field) return;
    setFieldValue(suggestion.field, suggestion.suggestedValue);
  };

  const renderFieldControl = (field: RegistryFieldDescriptor) => {
    const value = formValues[field.key];
    const errorText = fieldErrors[field.key];

    if (field.type === 'boolean') {
      return (
        <FormControlLabel
          control={<Switch checked={ensureBoolean(value)} onChange={e => setFieldValue(field.key, e.target.checked)} />}
          label={field.label}
        />
      );
    }

    if (field.type === 'enum') {
      return (
        <FormControl fullWidth size="small" error={Boolean(errorText)}>
          <InputLabel>{field.label}</InputLabel>
          <Select
            label={field.label}
            value={typeof value === 'string' ? value : String(field.defaultValue || '')}
            onChange={e => setFieldValue(field.key, e.target.value)}
          >
            {(field.options || []).map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
          {errorText && <FormHelperText>{errorText}</FormHelperText>}
        </FormControl>
      );
    }

    if (field.type === 'multiselect') {
      const selected = Array.isArray(value) ? value.map(v => String(v)) : [];
      return (
        <FormControl fullWidth size="small" error={Boolean(errorText)}>
          <InputLabel>{field.label}</InputLabel>
          <Select
            multiple
            label={field.label}
            value={selected}
            onChange={e => setFieldValue(field.key, e.target.value)}
            renderValue={selectedValues => (
              <Stack direction="row" gap={0.5} flexWrap="wrap">
                {(selectedValues as string[]).map(v => (
                  <Chip key={v} size="small" label={field.options?.find(o => o.value === v)?.label || v} />
                ))}
              </Stack>
            )}
          >
            {(field.options || []).map(option => (
              <MenuItem key={option.value} value={option.value}>
                <Checkbox checked={selected.includes(option.value)} />
                <ListItemText primary={option.label} secondary={option.description} />
              </MenuItem>
            ))}
          </Select>
          {errorText && <FormHelperText>{errorText}</FormHelperText>}
        </FormControl>
      );
    }

    if (field.type === 'string-array') {
      const text = Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '';
      return (
        <TextField
          fullWidth
          multiline
          minRows={3}
          size="small"
          label={field.label}
          value={text}
          placeholder={field.placeholder || 'One value per line'}
          onChange={e => setFieldValue(field.key, e.target.value)}
          error={Boolean(errorText)}
          helperText={errorText || field.description}
        />
      );
    }

    if (field.type === 'json') {
      const text =
        typeof value === 'string'
          ? value
          : value !== undefined
            ? JSON.stringify(value, null, 2)
            : '';
      return (
        <TextField
          fullWidth
          multiline
          minRows={4}
          size="small"
          label={field.label}
          value={text}
          placeholder={field.placeholder || '{\n  "key": "value"\n}'}
          onChange={e => setFieldValue(field.key, e.target.value)}
          error={Boolean(errorText)}
          helperText={errorText || field.description}
        />
      );
    }

    const isNumber = field.type === 'number' || field.type === 'integer';

    return (
      <TextField
        fullWidth
        size="small"
        label={field.label}
        type={isNumber ? 'number' : field.secret ? 'password' : 'text'}
        value={value ?? ''}
        onChange={e => setFieldValue(field.key, isNumber ? e.target.value : e.target.value)}
        inputProps={{
          min: field.constraints?.min,
          max: field.constraints?.max,
          step: field.constraints?.step || (field.type === 'integer' ? 1 : undefined),
          minLength: field.constraints?.minLength,
          maxLength: field.constraints?.maxLength,
          pattern: field.constraints?.pattern
        }}
        placeholder={field.placeholder}
        error={Boolean(errorText)}
        helperText={errorText || field.description}
      />
    );
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Post Filter Settings
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Choose how your pod handles posts from other servers. You can safely review and update each filter here.
      </Typography>

      <Button variant="outlined" size="small" sx={{ mb: 2 }} onClick={() => navigate('/settings/mrf/traces')}>
        View Activity Log
      </Button>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && <CircularProgress size={20} />}

      {!loading && (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
          <Box minWidth={{ xs: '100%', md: 280 }} width={{ xs: '100%', md: 320 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Post filters
            </Typography>
            <List dense sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
              {modules.map(item => {
                const active = item.manifest.id === activeModuleId;
                return (
                  <ListItem key={item.manifest.id} disablePadding divider>
                    <ListItemButton selected={active} onClick={() => handleSelectModule(item.manifest.id)}>
                      <ListItemText
                        primary={item.manifest.name}
                        secondary={item.config ? `${MODE_LABELS[item.config.mode]} · rev ${item.config.revision}` : 'Not configured'}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          </Box>

          <Box flex={1} width="100%">
            {modules.length === 0 ? (
              <Alert severity="info">No post filters are available for this account yet.</Alert>
            ) : !descriptor || !moduleState ? (
              <Alert severity="info">Loading post filter settings...</Alert>
            ) : (
              <Stack spacing={2}>
                <Box>
                  <Typography variant="h6">{descriptor.manifest.name}</Typography>
                  {descriptor.ui.shortDescription && (
                    <Typography variant="body2" color="text.secondary">
                      {descriptor.ui.shortDescription}
                    </Typography>
                  )}
                  <Stack direction="row" gap={1} mt={1} flexWrap="wrap">
                    <Chip size="small" label={`Version ${descriptor.manifest.version}`} />
                    <Chip size="small" label={`Schema v${descriptor.manifest.configSchemaVersion}`} />
                    <Chip size="small" label={`Category: ${descriptor.ui.category}`} />
                  </Stack>
                </Box>

                {(descriptor.ui.warnings || []).length > 0 && (
                  <Alert severity="warning">
                    <Stack spacing={0.5}>
                      {(descriptor.ui.warnings || []).map(w => (
                        <Typography key={w} variant="body2">
                          {w}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                )}

                {(descriptor.config.invariants || []).length > 0 && (
                  <Alert severity="info">
                    <Stack spacing={0.5}>
                      <Typography variant="body2" fontWeight={600}>
                        Invariants
                      </Typography>
                      {descriptor.config.invariants.map(invariant => (
                        <Typography key={invariant.code} variant="body2">
                          {invariant.message}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                )}

                {tuningContext && (
                  <Alert severity={tuningContext.moduleId === descriptor.manifest.id ? 'info' : 'warning'}>
                    <Stack spacing={1}>
                      <Typography variant="body2" fontWeight={600}>
                        Suggestions from activity log {tuningContext.traceId ? `(${tuningContext.traceId})` : ''}
                      </Typography>

                      {tuningContext.moduleId !== descriptor.manifest.id && (
                        <Typography variant="body2">
                          These suggestions are for {tuningContext.moduleId}. Open that filter to use them.
                        </Typography>
                      )}

                      {tuningContext.moduleId === descriptor.manifest.id && tuningContext.suggestions.length === 0 && (
                        <Typography variant="body2">No automatic suggestions were generated for this item.</Typography>
                      )}

                      {tuningContext.moduleId === descriptor.manifest.id && tuningContext.suggestions.length > 0 && (
                        <Stack spacing={1}>
                          {tuningContext.suggestions.map(item => (
                            <Box
                              key={`${item.field}:${item.type}`}
                              sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
                            >
                              <Typography variant="body2" fontWeight={600}>
                                {item.field} {'->'} {String(item.suggestedValue)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                                {item.rationale}
                              </Typography>
                              <Button size="small" variant="outlined" onClick={() => handleApplySuggestion(item)}>
                                Use this suggestion
                              </Button>
                            </Box>
                          ))}
                        </Stack>
                      )}
                    </Stack>
                  </Alert>
                )}

                {(descriptor.safety.enforceGuardrails || []).length > 0 && (
                  <Alert severity="warning">
                    <Stack spacing={0.5}>
                      <Typography variant="body2" fontWeight={600}>
                        Safety rules you must keep
                      </Typography>
                      {(descriptor.safety.enforceGuardrails || []).map(guardrail => (
                        <Typography key={guardrail} variant="body2">
                          {guardrail}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                )}

                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <FormControlLabel
                    control={<Switch checked={enabled} onChange={e => setEnabled(e.target.checked)} />}
                    label="Turn this filter on"
                  />
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Mode</InputLabel>
                    <Select
                      label="Mode"
                      value={mode}
                      onChange={e => setMode(e.target.value as MRFMode)}
                    >
                      {(Object.keys(MODE_LABELS) as MRFMode[]).map(m => (
                        <MenuItem key={m} value={m} disabled={disallowedModes.has(m)}>
                          {MODE_LABELS[m]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    size="small"
                    type="number"
                    label="Priority"
                    value={priority}
                    onChange={e => setPriority(Number(e.target.value))}
                    inputProps={{ min: 0, max: 10000, step: 1 }}
                    sx={{ width: 140 }}
                  />
                  <FormControlLabel
                    control={<Switch checked={stopOnMatch} onChange={e => setStopOnMatch(e.target.checked)} />}
                    label="Stop on match"
                    disabled={!descriptor.ui.supportsStopOnMatch}
                  />
                </Stack>

                {mode === 'enforce' && descriptor.safety.requireSimulatorBeforeEnforce && (
                  <Alert severity="warning">
                    <Stack spacing={1}>
                      <Typography variant="body2">
                        Run simulator and review dry-run traces before enforce mode.
                      </Typography>
                      <FormControlLabel
                        control={
                          <Checkbox checked={confirmEnforceRisk} onChange={e => setConfirmEnforceRisk(e.target.checked)} />
                        }
                        label="I confirm enforce-mode risk has been reviewed"
                      />
                    </Stack>
                  </Alert>
                )}

                {fieldErrors.__mode && <Alert severity="error">{fieldErrors.__mode}</Alert>}

                <Divider />

                <Stack spacing={2}>
                  {descriptor.config.fields
                    .filter(field => !field.secret)
                    .map(field => (
                      <Box key={field.key}>{renderFieldControl(field)}</Box>
                    ))}
                </Stack>

                {serverWarnings.length > 0 && (
                  <Alert severity="warning">
                    <Stack spacing={0.5}>
                      {serverWarnings.map(item => (
                        <Typography key={item} variant="body2">
                          {item}
                        </Typography>
                      ))}
                    </Stack>
                  </Alert>
                )}

                <Stack direction="row" spacing={1}>
                  <Button variant="contained" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save filter'}
                  </Button>
                  <Button variant="outlined" onClick={() => activeModuleId && loadModuleEditor(activeModuleId)}>
                    Reload
                  </Button>
                </Stack>
              </Stack>
            )}
          </Box>
        </Stack>
      )}
    </Box>
  );
};

export default MrfControlPage;
