import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  FormHelperText,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteIcon from '@mui/icons-material/Delete';
import Header from '../../common/Header';
import { dashboardApi } from './dashboardApi';

type MRFMode = 'disabled' | 'dry-run' | 'enforce';

type ActorReputationConfig = {
  maxAccountAgeDays: number;
  minFollowerCount: number;
  maxLinksInContent: number;
  maxHashtagCount: number;
  maxMentionCount: number;
  requireAvatar: boolean;
  requireBio: boolean;
  minSignalsToFlag: number;
  action: 'label' | 'filter' | 'reject';
  traceReasons: boolean;
};

type ContentFingerprintConfig = {
  minContentLength: number;
  maxDistinctActors: number;
  windowHours: number;
  normalizeUrls: boolean;
  action: 'label' | 'filter' | 'reject';
  traceReasons: boolean;
};

type DomainReputationConfig = {
  action: 'label' | 'filter' | 'reject';
  traceReasons: boolean;
};

type DomainEntry = {
  domain: string;
  subdomainMatch: boolean;
};

type ModuleState<T> = {
  enabled: boolean;
  mode: MRFMode;
  revision: number;
  config: T;
};

const AR_DEFAULTS: ActorReputationConfig = {
  maxAccountAgeDays: 7,
  minFollowerCount: 1,
  maxLinksInContent: 1,
  maxHashtagCount: 10,
  maxMentionCount: 20,
  requireAvatar: false,
  requireBio: false,
  minSignalsToFlag: 2,
  action: 'label',
  traceReasons: true
};

const CFP_DEFAULTS: ContentFingerprintConfig = {
  minContentLength: 50,
  maxDistinctActors: 5,
  windowHours: 24,
  normalizeUrls: true,
  action: 'label',
  traceReasons: true
};

const DR_DEFAULTS: DomainReputationConfig = {
  action: 'filter',
  traceReasons: true
};

const MODE_LABELS: Record<MRFMode, string> = {
  disabled: 'Disabled',
  'dry-run': 'Dry run (observe only)',
  enforce: 'Enforce'
};

const clampInt = (value: string | number, min: number, max: number): number => {
  const n = parseInt(String(value), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const ModeSelect = ({ value, onChange }: { value: MRFMode; onChange: (m: MRFMode) => void }) => (
  <FormControl size="small" sx={{ minWidth: 200 }}>
    <InputLabel>Mode</InputLabel>
    <Select value={value} label="Mode" onChange={e => onChange(e.target.value as MRFMode)}>
      {(Object.keys(MODE_LABELS) as MRFMode[]).map(m => (
        <MenuItem key={m} value={m}>
          {MODE_LABELS[m]}
        </MenuItem>
      ))}
    </Select>
  </FormControl>
);

const ProviderSpamProtectionPage = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // ── Actor Reputation state ────────────────────────────────────────────────
  const [arEnabled, setArEnabled] = useState(false);
  const [arMode, setArMode] = useState<MRFMode>('dry-run');
  const [arRevision, setArRevision] = useState(0);
  const [arConfig, setArConfig] = useState<ActorReputationConfig>({ ...AR_DEFAULTS });
  const [arSaving, setArSaving] = useState(false);
  const [arSaved, setArSaved] = useState(false);
  const [arError, setArError] = useState<string | null>(null);
  const [arConfirmEnforce, setArConfirmEnforce] = useState(false);

  // ── Content Fingerprint state ─────────────────────────────────────────────
  const [cfpEnabled, setCfpEnabled] = useState(false);
  const [cfpMode, setCfpMode] = useState<MRFMode>('dry-run');
  const [cfpRevision, setCfpRevision] = useState(0);
  const [cfpConfig, setCfpConfig] = useState<ContentFingerprintConfig>({ ...CFP_DEFAULTS });
  const [cfpSaving, setCfpSaving] = useState(false);
  const [cfpSaved, setCfpSaved] = useState(false);
  const [cfpError, setCfpError] = useState<string | null>(null);
  const [cfpConfirmEnforce, setCfpConfirmEnforce] = useState(false);

  // ── Domain Reputation state ───────────────────────────────────────────────
  const [drEnabled, setDrEnabled] = useState(false);
  const [drMode, setDrMode] = useState<MRFMode>('dry-run');
  const [drRevision, setDrRevision] = useState(0);
  const [drConfig, setDrConfig] = useState<DomainReputationConfig>({ ...DR_DEFAULTS });
  const [drSaving, setDrSaving] = useState(false);
  const [drSaved, setDrSaved] = useState(false);
  const [drError, setDrError] = useState<string | null>(null);

  // Domain list
  const [domainEntries, setDomainEntries] = useState<DomainEntry[]>([]);
  const [domainListLoading, setDomainListLoading] = useState(false);
  const [domainListError, setDomainListError] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainSubMatch, setNewDomainSubMatch] = useState(false);
  const [addingDomain, setAddingDomain] = useState(false);
  const [addDomainError, setAddDomainError] = useState<string | null>(null);

  const loadDomains = useCallback(async () => {
    setDomainListLoading(true);
    setDomainListError(null);
    try {
      const res = await dashboardApi.listSpamDomains();
      const data = res as { domains?: DomainEntry[] } | null;
      setDomainEntries(data?.domains ?? []);
    } catch (err: unknown) {
      setDomainListError(err instanceof Error ? err.message : 'Failed to load domain blocklist.');
    } finally {
      setDomainListLoading(false);
    }
  }, []);

  const loadModules = useCallback(async () => {
    setLoading(true);
    setGlobalError(null);
    try {
      const [arRes, cfpRes, drRes] = await Promise.all([
        dashboardApi.getMrfModule('actor-reputation'),
        dashboardApi.getMrfModule('content-fingerprint'),
        dashboardApi.getMrfModule('domain-reputation')
      ]);

      const ar = arRes?.data as ModuleState<ActorReputationConfig> | null;
      if (ar) {
        setArEnabled(ar.enabled ?? false);
        setArMode(ar.mode ?? 'dry-run');
        setArRevision(ar.revision ?? 0);
        setArConfig({ ...AR_DEFAULTS, ...(ar.config ?? {}) });
      }

      const cfp = cfpRes?.data as ModuleState<ContentFingerprintConfig> | null;
      if (cfp) {
        setCfpEnabled(cfp.enabled ?? false);
        setCfpMode(cfp.mode ?? 'dry-run');
        setCfpRevision(cfp.revision ?? 0);
        setCfpConfig({ ...CFP_DEFAULTS, ...(cfp.config ?? {}) });
      }

      const dr = drRes?.data as ModuleState<DomainReputationConfig> | null;
      if (dr) {
        setDrEnabled(dr.enabled ?? false);
        setDrMode(dr.mode ?? 'dry-run');
        setDrRevision(dr.revision ?? 0);
        setDrConfig({ ...DR_DEFAULTS, ...(dr.config ?? {}) });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load spam protection settings.';
      setGlobalError(
        msg.includes('not configured') ? 'Spam protection is not available — connect the filtering service first.' : msg
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadModules();
    loadDomains();
  }, [loadModules, loadDomains]);

  const setArField = <K extends keyof ActorReputationConfig>(key: K, value: ActorReputationConfig[K]) => {
    setArSaved(false);
    setArConfig(prev => ({ ...prev, [key]: value }));
  };

  const setcfpField = <K extends keyof ContentFingerprintConfig>(key: K, value: ContentFingerprintConfig[K]) => {
    setCfpSaved(false);
    setCfpConfig(prev => ({ ...prev, [key]: value }));
  };

  const setDrField = <K extends keyof DomainReputationConfig>(key: K, value: DomainReputationConfig[K]) => {
    setDrSaved(false);
    setDrConfig(prev => ({ ...prev, [key]: value }));
  };

  const saveActorReputation = async () => {
    setArSaving(true);
    setArSaved(false);
    setArError(null);
    try {
      await dashboardApi.patchMrfModule('actor-reputation', {
        enabled: arEnabled,
        mode: arMode,
        config: arConfig
      });
      setArSaved(true);
      setArRevision(r => r + 1);
    } catch (err: unknown) {
      setArError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setArSaving(false);
    }
  };

  const saveContentFingerprint = async () => {
    setCfpSaving(true);
    setCfpSaved(false);
    setCfpError(null);
    try {
      await dashboardApi.patchMrfModule('content-fingerprint', {
        enabled: cfpEnabled,
        mode: cfpMode,
        config: cfpConfig
      });
      setCfpSaved(true);
      setCfpRevision(r => r + 1);
    } catch (err: unknown) {
      setCfpError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setCfpSaving(false);
    }
  };

  const saveDomainReputation = async () => {
    setDrSaving(true);
    setDrSaved(false);
    setDrError(null);
    try {
      await dashboardApi.patchMrfModule('domain-reputation', {
        enabled: drEnabled,
        mode: drMode,
        config: drConfig
      });
      setDrSaved(true);
      setDrRevision(r => r + 1);
    } catch (err: unknown) {
      setDrError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setDrSaving(false);
    }
  };

  const handleAddDomain = async () => {
    const domain = newDomain.trim().toLowerCase();
    if (!domain) return;
    setAddingDomain(true);
    setAddDomainError(null);
    try {
      await dashboardApi.addSpamDomain({ domain, subdomainMatch: newDomainSubMatch });
      setNewDomain('');
      setNewDomainSubMatch(false);
      await loadDomains();
    } catch (err: unknown) {
      setAddDomainError(err instanceof Error ? err.message : 'Failed to add domain.');
    } finally {
      setAddingDomain(false);
    }
  };

  const handleRemoveDomain = async (entry: DomainEntry) => {
    try {
      await dashboardApi.removeSpamDomain({ domain: entry.domain, subdomainMatch: entry.subdomainMatch });
      await loadDomains();
    } catch (err: unknown) {
      setDomainListError(err instanceof Error ? err.message : 'Failed to remove domain.');
    }
  };

  const arEnforceRisky = arMode === 'enforce' && arConfig.action === 'reject';
  const cfpEnforceRisky = cfpMode === 'enforce' && cfpConfig.action === 'reject';

  if (loading) {
    return (
      <>
        <Header title="app.titles.settings" />
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress />
        </Box>
      </>
    );
  }

  return (
    <>
      <Header title="app.titles.settings" />
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/settings/provider')}
        sx={{ mt: 1, mb: 2 }}
        size="small"
      >
        Back
      </Button>

      <Typography variant="h2" component="h1" noWrap sx={{ mb: 1 }}>
        Spam Protection
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Three complementary detection layers. Run each in dry-run mode first and review MRF traces before enabling
        enforcement.
      </Typography>

      {globalError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {globalError}
        </Alert>
      )}

      {/* ── Actor Reputation ─────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Actor Reputation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Detects spam from new or unsocialised accounts: excessive links, hashtag floods, and mention storms
          (AntiLinkSpam + HellThread patterns). Multiple signals must fire together before action is taken.
        </Typography>

        {arError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setArError(null)}>
            {arError}
          </Alert>
        )}
        {arSaved && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setArSaved(false)}>
            Actor reputation settings saved.
          </Alert>
        )}

        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <FormControlLabel
            control={<Switch checked={arEnabled} onChange={e => setArEnabled(e.target.checked)} />}
            label="Enabled"
          />
          <ModeSelect
            value={arMode}
            onChange={m => {
              setArMode(m);
              setArConfirmEnforce(false);
            }}
          />
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1, mt: 1 }}>
          Actor signals
        </Typography>
        <Stack spacing={2} sx={{ mb: 2 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              label="New account window (days)"
              helperText="0 = disabled"
              type="number"
              size="small"
              value={arConfig.maxAccountAgeDays}
              onChange={e => setArField('maxAccountAgeDays', clampInt(e.target.value, 0, 365))}
              inputProps={{ min: 0, max: 365, step: 1 }}
              sx={{ width: 220 }}
            />
            <TextField
              label="Minimum follower count"
              helperText="0 = disabled"
              type="number"
              size="small"
              value={arConfig.minFollowerCount}
              onChange={e => setArField('minFollowerCount', clampInt(e.target.value, 0, 100000))}
              inputProps={{ min: 0, max: 100000, step: 1 }}
              sx={{ width: 220 }}
            />
          </Stack>
          <Stack direction="row" spacing={3}>
            <FormControlLabel
              control={
                <Switch
                  checked={arConfig.requireAvatar}
                  onChange={e => setArField('requireAvatar', e.target.checked)}
                />
              }
              label="Require avatar"
            />
            <FormControlLabel
              control={
                <Switch checked={arConfig.requireBio} onChange={e => setArField('requireBio', e.target.checked)} />
              }
              label="Require bio"
            />
          </Stack>
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Content signals
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Max links"
            helperText="0 = disabled"
            type="number"
            size="small"
            value={arConfig.maxLinksInContent}
            onChange={e => setArField('maxLinksInContent', clampInt(e.target.value, 0, 100))}
            inputProps={{ min: 0, max: 100, step: 1 }}
            sx={{ width: 140 }}
          />
          <TextField
            label="Max hashtags"
            helperText="0 = disabled"
            type="number"
            size="small"
            value={arConfig.maxHashtagCount}
            onChange={e => setArField('maxHashtagCount', clampInt(e.target.value, 0, 200))}
            inputProps={{ min: 0, max: 200, step: 1 }}
            sx={{ width: 140 }}
          />
          <TextField
            label="Max mentions (cc)"
            helperText="0 = disabled"
            type="number"
            size="small"
            value={arConfig.maxMentionCount}
            onChange={e => setArField('maxMentionCount', clampInt(e.target.value, 0, 500))}
            inputProps={{ min: 0, max: 500, step: 1 }}
            sx={{ width: 160 }}
          />
        </Stack>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Enforcement
        </Typography>
        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <TextField
            label="Signals to flag"
            helperText="Minimum simultaneous signals"
            type="number"
            size="small"
            value={arConfig.minSignalsToFlag}
            onChange={e => setArField('minSignalsToFlag', clampInt(e.target.value, 1, 10))}
            inputProps={{ min: 1, max: 10, step: 1 }}
            sx={{ width: 160 }}
          />
          <FormControl size="small" sx={{ width: 240 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={arConfig.action}
              label="Action"
              onChange={e => setArField('action', e.target.value as ActorReputationConfig['action'])}
            >
              <MenuItem value="label">Label</MenuItem>
              <MenuItem value="filter">Filter</MenuItem>
              <MenuItem value="reject">Reject</MenuItem>
            </Select>
            <FormHelperText>Start with Label, graduate after reviewing traces</FormHelperText>
          </FormControl>
          <FormControlLabel
            control={
              <Switch checked={arConfig.traceReasons} onChange={e => setArField('traceReasons', e.target.checked)} />
            }
            label="Trace reasons"
            sx={{ mt: 0.5 }}
          />
        </Stack>

        {arEnforceRisky && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Reject in enforce mode — activities will be dropped.
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={arConfirmEnforce}
                    onChange={e => setArConfirmEnforce(e.target.checked)}
                    size="small"
                  />
                }
                label="I have reviewed traces and accept the risk"
              />
            </Box>
          </Alert>
        )}

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            onClick={saveActorReputation}
            disabled={arSaving || (!arEnforceRisky || arConfirmEnforce ? false : true)}
          >
            {arSaving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
          <Button variant="outlined" onClick={loadModules} disabled={arSaving || loading}>
            Reset
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Module: actor-reputation · Revision: {arRevision}
        </Typography>
      </Paper>

      {/* ── Content Fingerprint ───────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Content Fingerprint
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Detects copy-paste spam by fingerprinting post content and tracking how many distinct accounts send the same
          text within a rolling time window. Effective against coordinated spam campaigns that bypass actor-level
          checks.
        </Typography>

        {cfpError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setCfpError(null)}>
            {cfpError}
          </Alert>
        )}
        {cfpSaved && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setCfpSaved(false)}>
            Content fingerprint settings saved.
          </Alert>
        )}

        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <FormControlLabel
            control={<Switch checked={cfpEnabled} onChange={e => setCfpEnabled(e.target.checked)} />}
            label="Enabled"
          />
          <ModeSelect
            value={cfpMode}
            onChange={m => {
              setCfpMode(m);
              setCfpConfirmEnforce(false);
            }}
          />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Distinct actors to trigger"
            helperText="Min 2 — accounts sending identical content"
            type="number"
            size="small"
            value={cfpConfig.maxDistinctActors}
            onChange={e => setcfpField('maxDistinctActors', clampInt(e.target.value, 2, 1000))}
            inputProps={{ min: 2, max: 1000, step: 1 }}
            sx={{ width: 220 }}
          />
          <TextField
            label="Detection window (hours)"
            helperText="Rolling lookback period"
            type="number"
            size="small"
            value={cfpConfig.windowHours}
            onChange={e => setcfpField('windowHours', clampInt(e.target.value, 1, 720))}
            inputProps={{ min: 1, max: 720, step: 1 }}
            sx={{ width: 200 }}
          />
          <TextField
            label="Min content length (chars)"
            helperText="Skip very short posts"
            type="number"
            size="small"
            value={cfpConfig.minContentLength}
            onChange={e => setcfpField('minContentLength', clampInt(e.target.value, 0, 10000))}
            inputProps={{ min: 0, max: 10000, step: 1 }}
            sx={{ width: 210 }}
          />
        </Stack>

        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={cfpConfig.normalizeUrls}
                onChange={e => setcfpField('normalizeUrls', e.target.checked)}
              />
            }
            label="Normalize URLs before hashing"
          />
          <FormControlLabel
            control={
              <Switch checked={cfpConfig.traceReasons} onChange={e => setcfpField('traceReasons', e.target.checked)} />
            }
            label="Trace reasons"
          />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ width: 240 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={cfpConfig.action}
              label="Action"
              onChange={e => setcfpField('action', e.target.value as ContentFingerprintConfig['action'])}
            >
              <MenuItem value="label">Label</MenuItem>
              <MenuItem value="filter">Filter</MenuItem>
              <MenuItem value="reject">Reject</MenuItem>
            </Select>
            <FormHelperText>Start with Label, graduate after reviewing traces</FormHelperText>
          </FormControl>
        </Stack>

        {cfpEnforceRisky && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Reject in enforce mode — cross-posted legitimate content may be caught. Ensure maxDistinctActors ≥ 3.
            <Box sx={{ mt: 1 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={cfpConfirmEnforce}
                    onChange={e => setCfpConfirmEnforce(e.target.checked)}
                    size="small"
                  />
                }
                label="I have reviewed traces and accept the risk"
              />
            </Box>
          </Alert>
        )}

        <Stack direction="row" spacing={2}>
          <Button
            variant="contained"
            onClick={saveContentFingerprint}
            disabled={cfpSaving || (!cfpEnforceRisky || cfpConfirmEnforce ? false : true)}
          >
            {cfpSaving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
          <Button variant="outlined" onClick={loadModules} disabled={cfpSaving || loading}>
            Reset
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
          Module: content-fingerprint · Revision: {cfpRevision}
        </Typography>
      </Paper>

      {/* ── Domain Reputation ─────────────────────────────────────────────── */}
      <Paper variant="outlined" sx={{ p: 3, mb: 4, borderRadius: 2 }}>
        <Typography variant="h6" fontWeight={700} sx={{ mb: 0.5 }}>
          Domain Reputation
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Blocks activities containing links to domains on your blocklist. Supports exact matches and wildcard
          subdomain matches. Effective for known spam infrastructure and abusive link-shorteners.
        </Typography>

        {drError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDrError(null)}>
            {drError}
          </Alert>
        )}
        {drSaved && (
          <Alert severity="success" sx={{ mb: 2 }} onClose={() => setDrSaved(false)}>
            Domain reputation settings saved.
          </Alert>
        )}

        <Stack direction="row" spacing={3} alignItems="center" sx={{ mb: 2 }}>
          <FormControlLabel
            control={<Switch checked={drEnabled} onChange={e => setDrEnabled(e.target.checked)} />}
            label="Enabled"
          />
          <ModeSelect value={drMode} onChange={setDrMode} />
        </Stack>

        <Stack direction="row" spacing={2} alignItems="flex-start" sx={{ mb: 2 }}>
          <FormControl size="small" sx={{ width: 240 }}>
            <InputLabel>Action</InputLabel>
            <Select
              value={drConfig.action}
              label="Action"
              onChange={e => setDrField('action', e.target.value as DomainReputationConfig['action'])}
            >
              <MenuItem value="label">Label</MenuItem>
              <MenuItem value="filter">Filter</MenuItem>
              <MenuItem value="reject">Reject</MenuItem>
            </Select>
            <FormHelperText>Applied when a blocked domain appears in content</FormHelperText>
          </FormControl>
          <FormControlLabel
            control={
              <Switch checked={drConfig.traceReasons} onChange={e => setDrField('traceReasons', e.target.checked)} />
            }
            label="Trace reasons"
            sx={{ mt: 0.5 }}
          />
        </Stack>

        <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
          <Button variant="contained" onClick={saveDomainReputation} disabled={drSaving}>
            {drSaving ? <CircularProgress size={20} /> : 'Save'}
          </Button>
          <Button variant="outlined" onClick={loadModules} disabled={drSaving || loading}>
            Reset
          </Button>
        </Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          Module: domain-reputation · Revision: {drRevision}
        </Typography>

        <Divider sx={{ mb: 2 }} />

        {/* Domain blocklist management */}
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Blocked domain list
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Exact match blocks only that hostname. Subdomain match also blocks all subdomains (e.g. adding
          &quot;example.com&quot; with subdomain match will block &quot;sub.example.com&quot; too).
        </Typography>

        {domainListError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDomainListError(null)}>
            {domainListError}
          </Alert>
        )}

        {/* Add domain form */}
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
          <TextField
            label="Domain"
            placeholder="e.g. spam.example.com"
            size="small"
            value={newDomain}
            onChange={e => {
              setNewDomain(e.target.value);
              setAddDomainError(null);
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddDomain(); }}
            error={!!addDomainError}
            helperText={addDomainError ?? ''}
            sx={{ width: 280 }}
          />
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={newDomainSubMatch}
                onChange={e => setNewDomainSubMatch(e.target.checked)}
              />
            }
            label="Include subdomains"
            sx={{ whiteSpace: 'nowrap' }}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={handleAddDomain}
            disabled={addingDomain || !newDomain.trim()}
          >
            {addingDomain ? <CircularProgress size={16} /> : 'Add'}
          </Button>
        </Stack>

        {/* Domain list */}
        {domainListLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={24} />
          </Box>
        ) : domainEntries.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
            No domains blocked yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {domainEntries.map(entry => (
              <ListItem
                key={`${entry.domain}-${entry.subdomainMatch}`}
                disableGutters
                divider
                sx={{ py: 0.5 }}
              >
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" component="span" sx={{ fontFamily: 'monospace' }}>
                        {entry.domain}
                      </Typography>
                      {entry.subdomainMatch && (
                        <Chip label="+ subdomains" size="small" variant="outlined" color="warning" />
                      )}
                    </Stack>
                  }
                />
                <ListItemSecondaryAction>
                  <IconButton
                    edge="end"
                    size="small"
                    aria-label={`Remove ${entry.domain}`}
                    onClick={() => handleRemoveDomain(entry)}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </Paper>

      <Divider sx={{ mb: 2 }} />
      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>Tip:</strong> View decision traces at{' '}
        <Button
          size="small"
          variant="text"
          sx={{ p: 0, minWidth: 0, textTransform: 'none', fontWeight: 600 }}
          onClick={() => navigate('/settings/mrf')}
        >
          MRF Control
        </Button>{' '}
        to see which activities are being matched and tune thresholds accordingly.
      </Alert>
    </>
  );
};

export default ProviderSpamProtectionPage;
