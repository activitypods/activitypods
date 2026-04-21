import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type ModerationAction = 'label' | 'warn' | 'filter' | 'block' | 'suspend';
type MRFMode = 'disabled' | 'dry-run' | 'enforce';

type ModerationDecision = {
  id: string;
  appliedAt: string;
  appliedBy: string;
  action: ModerationAction;
  labels: string[];
  targetWebId?: string;
  targetActorUri?: string;
  targetAtDid?: string;
  targetHandle?: string;
  sourceCaseId?: string;
  reason?: string;
  protocols?: 'none' | 'ap' | 'at' | 'both';
  revoked?: boolean;
};

type ModerationCase = {
  id: string;
  activityId?: string;
  source: 'activitypub-flag';
  protocol: 'ap';
  sourceActorUri: string;
  sourceActorWebId?: string;
  recipientActorUri?: string;
  recipientWebId?: string;
  inboxPath: string;
  reason?: string;
  reportedUris: string[];
  reportedActorUris: string[];
  receivedAt: string;
  createdAt?: string;
  status: 'open' | 'resolved' | 'dismissed';
  relatedDecisionIds: string[];
  updatedAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

type AtLabel = {
  src: string;
  uri: string;
  val: string;
  cts: string;
  neg?: boolean;
};

type ModuleConfigState = {
  enabled: boolean;
  mode: MRFMode;
  priority: number;
  stopOnMatch: boolean;
  revision: number;
  config: Record<string, unknown>;
};

type PdqStatus = {
  configured: boolean;
  serviceBaseUrl?: string | null;
  hasBearerToken?: boolean;
};

type FediseerStatus = {
  configured: boolean;
  serviceBaseUrl?: string | null;
  hasApiKey?: boolean;
  sourceDomains?: string[];
};

type FediseerEntry = {
  targetDomain: string;
  ruleId: string;
  action: 'reject' | 'filter';
  signals: string[];
  sourceDomains: string[];
  reasons: string[];
  evidence: string[];
  censureCount: number;
  hesitationCount: number;
  reason: string;
};

type PdqLookupResult = {
  imageUrl: string;
  pdqHashBinary: string;
  quality: number;
};

type ApiError = Error & { status?: number; code?: string };

const ACTIONS: Array<{ value: ModerationAction; label: string }> = [
  { value: 'label', label: 'Label' },
  { value: 'warn', label: 'Warn' },
  { value: 'filter', label: 'Filter' },
  { value: 'block', label: 'Block' },
  { value: 'suspend', label: 'Suspend' }
];

const DEFAULT_AT_LABELS = [
  '!hide',
  '!warn',
  '!no-unauthenticated',
  'spam',
  'porn',
  'sexual',
  'graphic-media',
  'nudity',
  'bot'
];

const DEFAULT_PDQ_QUALITY = 70;
const DEFAULT_PDQ_THRESHOLD = 15;

const protocolColor = (protocols: ModerationDecision['protocols']) => {
  switch (protocols) {
    case 'both':
      return 'success';
    case 'ap':
    case 'at':
      return 'info';
    default:
      return 'default';
  }
};

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};

const normalizePdqHash = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, '').toLowerCase();
  if (/^[01]{256}$/.test(normalized)) {
    return normalized;
  }
  if (/^[0-9a-f]{64}$/.test(normalized)) {
    return normalized
      .split('')
      .map(char => parseInt(char, 16).toString(2).padStart(4, '0'))
      .join('');
  }
  return null;
};

const normalizePdqHashes = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizePdqHash).filter((entry): entry is string => Boolean(entry)))]
    : [];

const extractPdqHashesFromText = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return normalizePdqHashes(parsed);
    }
  } catch {
    // Fall back to regex extraction for pasted SQL/JSON/CSV/text dumps.
  }

  const matches = trimmed.match(/\b(?:[01]{256}|[0-9a-fA-F]{64})\b/g) || [];
  return normalizePdqHashes(matches);
};

const truncatePdqHash = (hash: string) => (hash.length > 40 ? `${hash.slice(0, 18)}…${hash.slice(-18)}` : hash);

const describeModerationPropagation = (decision: ModerationDecision | null | undefined) => {
  switch (decision?.protocols) {
    case 'both':
      return 'Moderation decision propagated to ActivityPub and AT Protocol.';
    case 'ap':
      return 'Moderation decision propagated to ActivityPub.';
    case 'at':
      return 'Moderation decision propagated to AT Protocol.';
    default:
      return 'Decision saved, but no protocol action was applied. Resolve the target to an AT DID or ActivityPub actor URI to propagate it.';
  }
};

const parseFediseerSourceDomains = (value: string) => [
  ...new Set(
    value
      .split(/[\s,]+/)
      .map(item => item.trim().toLowerCase())
      .filter(Boolean)
  )
];

const caseStatusColor = (status: ModerationCase['status']) => {
  switch (status) {
    case 'resolved':
      return 'success';
    case 'dismissed':
      return 'warning';
    default:
      return 'default';
  }
};

export const ProviderCrossProtocolModerationPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const [targetWebId, setTargetWebId] = useState('');
  const [targetActorUri, setTargetActorUri] = useState('');
  const [targetAtDid, setTargetAtDid] = useState('');
  const [targetHandle, setTargetHandle] = useState('');
  const [sourceCaseId, setSourceCaseId] = useState('');
  const [action, setAction] = useState<ModerationAction>('warn');
  const [labelsInput, setLabelsInput] = useState('');
  const [reason, setReason] = useState('');

  const [knownLabels, setKnownLabels] = useState<string[]>(DEFAULT_AT_LABELS);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pdqSaving, setPdqSaving] = useState(false);
  const [pdqLookupLoading, setPdqLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<ModerationDecision[]>([]);
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [labels, setLabels] = useState<AtLabel[]>([]);

  const [mediaPolicyState, setMediaPolicyState] = useState<ModuleConfigState | null>(null);
  const [pdqStatus, setPdqStatus] = useState<PdqStatus | null>(null);
  const [blockedPdqHashes, setBlockedPdqHashes] = useState<string[]>([]);
  const [minPdqQuality, setMinPdqQuality] = useState(DEFAULT_PDQ_QUALITY);
  const [pdqHammingThreshold, setPdqHammingThreshold] = useState(DEFAULT_PDQ_THRESHOLD);
  const [pdqLookupImageUrl, setPdqLookupImageUrl] = useState('');
  const [pdqLookupResult, setPdqLookupResult] = useState<PdqLookupResult | null>(null);
  const [pdqImportText, setPdqImportText] = useState('');
  const [fediseerStatus, setFediseerStatus] = useState<FediseerStatus | null>(null);
  const [fediseerEntries, setFediseerEntries] = useState<FediseerEntry[]>([]);
  const [fediseerSourceDomainsInput, setFediseerSourceDomainsInput] = useState('');
  const [fediseerIncludeCensures, setFediseerIncludeCensures] = useState(true);
  const [fediseerIncludeHesitations, setFediseerIncludeHesitations] = useState(true);
  const [fediseerCensureAction, setFediseerCensureAction] = useState<'reject' | 'filter'>('reject');
  const [fediseerHesitationAction, setFediseerHesitationAction] = useState<'filter' | 'reject'>('filter');
  const [fediseerReplaceExisting, setFediseerReplaceExisting] = useState(true);
  const [fediseerSyncLoading, setFediseerSyncLoading] = useState(false);

  const parsedLabels = useMemo(
    () =>
      [
        ...new Set(
          labelsInput
            .split(',')
            .map(v => v.trim())
            .filter(Boolean)
        )
      ].slice(0, 20),
    [labelsInput]
  );

  const applyMediaPolicyState = useCallback((state: ModuleConfigState | null) => {
    setMediaPolicyState(state);
    const config = state?.config || {};
    setBlockedPdqHashes(normalizePdqHashes(config.blockedPdqHashes));
    setMinPdqQuality(clampInt(config.minPdqQuality, DEFAULT_PDQ_QUALITY, 0, 100));
    setPdqHammingThreshold(clampInt(config.pdqHammingThreshold, DEFAULT_PDQ_THRESHOLD, 0, 256));
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [
        decisionResult,
        caseResult,
        labelResult,
        knownResult,
        mediaPolicyResult,
        pdqStatusResult,
        fediseerStatusResult
      ] = await Promise.all([
        dashboardApi.listModerationDecisions({ limit: 200 }),
        dashboardApi.listModerationCases({ limit: 200 }).catch(() => null),
        dashboardApi.listAtLabels({ limit: 200 }),
        dashboardApi.listKnownAtLabels().catch(() => null),
        dashboardApi.getMrfModule('media-policy').catch(() => null),
        dashboardApi.getPdqHashStatus().catch(() => null),
        dashboardApi.getFediseerStatus().catch(() => null)
      ]);

      setDecisions(decisionResult?.data || decisionResult?.decisions || []);
      setCases(caseResult?.data || caseResult?.cases || []);
      setLabels(labelResult?.labels || []);
      applyMediaPolicyState((mediaPolicyResult?.data?.config as ModuleConfigState | null) || null);
      setPdqStatus((pdqStatusResult?.data as PdqStatus | null) || null);
      setFediseerStatus((fediseerStatusResult?.data as FediseerStatus | null) || null);

      const remoteLabels = knownResult?.globalLabels;
      if (Array.isArray(remoteLabels) && remoteLabels.length > 0) {
        setKnownLabels(remoteLabels);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  }, [applyMediaPolicyState]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setPdqLookupResult(null);
  }, [pdqLookupImageUrl]);

  useEffect(() => {
    if (
      !fediseerSourceDomainsInput.trim() &&
      Array.isArray(fediseerStatus?.sourceDomains) &&
      fediseerStatus.sourceDomains.length > 0
    ) {
      setFediseerSourceDomainsInput(fediseerStatus.sourceDomains.join(', '));
    }
  }, [fediseerSourceDomainsInput, fediseerStatus]);

  const resetForm = () => {
    setTargetWebId('');
    setTargetActorUri('');
    setTargetAtDid('');
    setTargetHandle('');
    setSourceCaseId('');
    setAction('warn');
    setLabelsInput('');
    setReason('');
  };

  const submitDecision = async () => {
    setError(null);
    setSuccess(null);

    if (!targetWebId.trim() && !targetActorUri.trim() && !targetAtDid.trim() && !targetHandle.trim()) {
      setError('Provide at least one target: WebID, AP actor URI, AT DID, or handle');
      return;
    }

    setSubmitting(true);
    try {
      const response = await dashboardApi.applyModerationDecision({
        targetWebId: targetWebId.trim() || undefined,
        targetActorUri: targetActorUri.trim() || undefined,
        targetAtDid: targetAtDid.trim() || undefined,
        targetHandle: targetHandle.trim() || undefined,
        sourceCaseId: sourceCaseId.trim() || undefined,
        action,
        labels: parsedLabels,
        reason: reason.trim() || undefined
      });

      const decision = response?.decision;
      if (decision) {
        setDecisions(prev => [decision, ...prev.filter(d => d.id !== decision.id)]);
      }
      setSuccess(describeModerationPropagation(decision));
      resetForm();
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply moderation decision');
    } finally {
      setSubmitting(false);
    }
  };

  const prepareDecisionFromCase = (entry: ModerationCase, nextAction: ModerationAction) => {
    const primaryTarget = entry.reportedActorUris[0] || entry.reportedUris[0] || '';
    if (!primaryTarget) {
      setError('This Flag report did not include a reported actor or object URI we can target directly.');
      return;
    }

    setSourceCaseId(entry.id);
    setTargetActorUri(primaryTarget);
    setTargetWebId('');
    setTargetAtDid('');
    setTargetHandle('');
    setAction(nextAction);
    setLabelsInput('');
    setReason(entry.reason || '');
    setSuccess(`Prepared a ${nextAction} action from report ${entry.id}. Review the target and submit when ready.`);
    setTab(0);
  };

  const revokeDecision = async (id: string) => {
    setError(null);
    try {
      await dashboardApi.revokeModerationDecision(id);
      setDecisions(prev => prev.map(d => (d.id === id ? { ...d, revoked: true } : d)));
      setSuccess('Decision revoked');
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke decision');
    }
  };

  const persistPdqPolicyPatch = async (configPatch: Record<string, unknown>, successMessage: string) => {
    if (!mediaPolicyState) {
      setError('The media policy module is unavailable right now.');
      return;
    }

    setPdqSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await dashboardApi.patchMrfModule('media-policy', {
        config: configPatch,
        expectedRevision: mediaPolicyState.revision
      });
      applyMediaPolicyState((response?.data as ModuleConfigState | null) || mediaPolicyState);
      setSuccess(successMessage);
      await loadAll();
    } catch (err: unknown) {
      const apiError = err as ApiError;
      if (apiError?.status === 409) {
        setError('The media policy changed elsewhere. We reloaded the latest version so you can try again.');
        await loadAll();
      } else {
        setError(apiError?.message || 'Failed to update PDQ image policy.');
      }
    } finally {
      setPdqSaving(false);
    }
  };

  const runFediseerSync = async (apply: boolean) => {
    setError(null);
    setSuccess(null);
    setFediseerSyncLoading(true);

    try {
      const response = await dashboardApi.syncFediseerDomainSignals({
        sourceDomains: parseFediseerSourceDomains(fediseerSourceDomainsInput),
        apply,
        replaceExisting: fediseerReplaceExisting,
        includeCensures: fediseerIncludeCensures,
        includeHesitations: fediseerIncludeHesitations,
        censureAction: fediseerCensureAction,
        hesitationAction: fediseerHesitationAction
      });

      const data = response?.data || response;
      setFediseerEntries((data?.entries as FediseerEntry[]) || []);
      if (apply) {
        const activeManagedRules = data?.applied?.activeManagedRules ?? data?.entries?.length ?? 0;
        setSuccess(
          `Fediseer sync applied ${activeManagedRules} managed ActivityPub domain rule${activeManagedRules === 1 ? '' : 's'}.`
        );
      } else {
        const previewCount = data?.entries?.length ?? 0;
        setSuccess(`Fediseer preview loaded ${previewCount} domain candidate${previewCount === 1 ? '' : 's'}.`);
      }
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fediseer sync failed.');
    } finally {
      setFediseerSyncLoading(false);
    }
  };

  const savePdqThresholds = async () => {
    await persistPdqPolicyPatch(
      {
        minPdqQuality: clampInt(minPdqQuality, DEFAULT_PDQ_QUALITY, 0, 100),
        pdqHammingThreshold: clampInt(pdqHammingThreshold, DEFAULT_PDQ_THRESHOLD, 0, 256)
      },
      'PDQ thresholds updated.'
    );
  };

  const lookupPdqHash = async () => {
    setError(null);
    setSuccess(null);
    setPdqLookupResult(null);

    if (!pdqLookupImageUrl.trim()) {
      setError('Enter an image URL to hash.');
      return;
    }

    setPdqLookupLoading(true);
    try {
      const response = await dashboardApi.lookupPdqHash({ imageUrl: pdqLookupImageUrl.trim() });
      const result = response?.data as PdqLookupResult | null;
      setPdqLookupResult(result);
      if (result) {
        setSuccess('PDQ hash computed from the provided image URL.');
      }
    } catch (err: unknown) {
      setPdqLookupResult(null);
      setError(err instanceof Error ? err.message : 'Failed to hash image URL.');
    } finally {
      setPdqLookupLoading(false);
    }
  };

  const addPdqHashToBlocklist = async () => {
    if (!pdqLookupResult) {
      setError('Hash an image before adding it to the blocked-image list.');
      return;
    }

    const nextHashes = [...new Set([...blockedPdqHashes, pdqLookupResult.pdqHashBinary])];
    await persistPdqPolicyPatch({ blockedPdqHashes: nextHashes }, 'Blocked image hash added to media policy.');
  };

  const removePdqHashFromBlocklist = async (hash: string) => {
    const nextHashes = blockedPdqHashes.filter(entry => entry !== hash);
    await persistPdqPolicyPatch({ blockedPdqHashes: nextHashes }, 'Blocked image hash removed.');
  };

  const importPdqHashes = async () => {
    const importedHashes = extractPdqHashesFromText(pdqImportText);
    if (importedHashes.length === 0) {
      setError('Paste at least one valid 256-bit binary or 64-character hexadecimal PDQ hash.');
      return;
    }

    const nextHashes = [...new Set([...blockedPdqHashes, ...importedHashes])];
    await persistPdqPolicyPatch(
      { blockedPdqHashes: nextHashes },
      `Imported ${importedHashes.length} blocked image hash${importedHashes.length === 1 ? '' : 'es'}.`
    );
    setPdqImportText('');
  };

  const currentBlockedAction =
    typeof mediaPolicyState?.config?.blockedAction === 'string' ? mediaPolicyState.config.blockedAction : 'reject';

  return (
    <Box sx={{ p: 3, maxWidth: 1200 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Provider Moderation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Apply cross-protocol moderation decisions, triage inbound ActivityPub Flag reports, sync Fediseer domain
          signals into ActivityPub enforcement, and maintain a PDQ-backed blocked-image list for media policy.
        </Typography>
      </Box>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 2 }}>
        <Button variant="outlined" onClick={() => navigate('/settings/mrf/activitypub-subject-policy')}>
          Open AP subject policy
        </Button>
        <Button variant="outlined" onClick={() => navigate('/settings/trust-sources')}>
          Open trust sources
        </Button>
        <Button variant="outlined" onClick={() => navigate('/settings/mrf/media-policy')}>
          Open full media policy
        </Button>
        <Button variant="text" onClick={() => navigate('/settings/mrf/traces')}>
          View filter activity log
        </Button>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2 }}>
        <Tab label="Apply decision" />
        <Tab label="Flag reports" />
        <Tab label="Decision history" />
        <Tab label="AT labels" />
        <Tab label="Fediseer" />
        <Tab label="PDQ blocklist" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {tab === 0 && (
            <Stack spacing={2}>
              {sourceCaseId && (
                <Alert severity="info">
                  This decision is linked to incoming report <strong>{sourceCaseId}</strong>. Submitting it will mark
                  the report resolved until all linked decisions are revoked.
                </Alert>
              )}
              <TextField
                label="Target WebID"
                value={targetWebId}
                onChange={e => setTargetWebId(e.target.value)}
                placeholder="https://pod.example/u/alice"
                fullWidth
              />
              <TextField
                label="Target AP actor URI"
                value={targetActorUri}
                onChange={e => setTargetActorUri(e.target.value)}
                placeholder="https://remote.example/users/alice"
                fullWidth
              />
              <TextField
                label="Target AT DID"
                value={targetAtDid}
                onChange={e => setTargetAtDid(e.target.value)}
                placeholder="did:plc:..."
                fullWidth
              />
              <TextField
                label="Target handle"
                value={targetHandle}
                onChange={e => setTargetHandle(e.target.value)}
                placeholder="alice.bsky.social"
                fullWidth
              />

              <FormControl fullWidth>
                <InputLabel id="moderation-action-label">Action</InputLabel>
                <Select
                  labelId="moderation-action-label"
                  label="Action"
                  value={action}
                  onChange={(e: SelectChangeEvent<ModerationAction>) => setAction(e.target.value as ModerationAction)}
                >
                  {ACTIONS.map(item => (
                    <MenuItem key={item.value} value={item.value}>
                      {item.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                label="Labels (comma-separated)"
                value={labelsInput}
                onChange={e => setLabelsInput(e.target.value)}
                placeholder="spam,!warn"
                helperText="Custom labels are allowed. Global AT labels available below."
                fullWidth
              />

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {knownLabels.map(label => (
                  <Chip
                    key={label}
                    label={label}
                    variant="outlined"
                    size="small"
                    onClick={() => {
                      const next = new Set(parsedLabels);
                      next.add(label);
                      setLabelsInput(Array.from(next).join(', '));
                    }}
                  />
                ))}
              </Stack>

              <TextField
                label="Reason"
                value={reason}
                onChange={e => setReason(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />

              <Stack direction="row" spacing={2}>
                <Button variant="contained" onClick={submitDecision} disabled={submitting}>
                  {submitting ? 'Applying…' : 'Apply moderation decision'}
                </Button>
                <Button variant="text" onClick={resetForm} disabled={submitting}>
                  Reset
                </Button>
              </Stack>
            </Stack>
          )}

          {tab === 1 &&
            (cases.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No inbound ActivityPub Flag reports recorded yet.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>Received</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Reporter</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Reported target</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Status</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Reason</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Ops</strong>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cases.map(entry => (
                      <TableRow key={entry.id} hover>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {new Date(entry.receivedAt).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {entry.sourceActorUri}
                            </Typography>
                            {entry.sourceActorWebId && (
                              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                {entry.sourceActorWebId}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            {(entry.reportedActorUris.length > 0 ? entry.reportedActorUris : entry.reportedUris)
                              .slice(0, 2)
                              .map(uri => (
                                <Typography
                                  key={`${entry.id}-${uri}`}
                                  variant="caption"
                                  sx={{ fontFamily: 'monospace' }}
                                >
                                  {uri}
                                </Typography>
                              ))}
                            {(entry.reportedActorUris.length > 2 || entry.reportedUris.length > 2) && (
                              <Typography variant="caption" color="text.secondary">
                                + more reported objects
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={entry.status}
                            size="small"
                            color={caseStatusColor(entry.status) as 'default' | 'success' | 'warning'}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption">
                            {entry.reason || 'No reason text provided in the Flag activity.'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Stack direction="row" spacing={1} justifyContent="flex-end">
                            <Button size="small" onClick={() => prepareDecisionFromCase(entry, 'filter')}>
                              Prepare filter
                            </Button>
                            <Button
                              size="small"
                              color="warning"
                              onClick={() => prepareDecisionFromCase(entry, 'block')}
                            >
                              Prepare block
                            </Button>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}

          {tab === 2 &&
            (decisions.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No moderation decisions recorded yet.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>When</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Target</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Action</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Labels</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Propagation</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Status</strong>
                      </TableCell>
                      <TableCell align="right">
                        <strong>Ops</strong>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {decisions.map(decision => (
                      <TableRow key={decision.id} hover>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {new Date(decision.appliedAt).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            {decision.targetHandle && (
                              <Typography variant="caption">{decision.targetHandle}</Typography>
                            )}
                            {decision.targetAtDid && (
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {decision.targetAtDid}
                              </Typography>
                            )}
                            {decision.targetActorUri && (
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {decision.targetActorUri}
                              </Typography>
                            )}
                            {decision.targetWebId && (
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {decision.targetWebId}
                              </Typography>
                            )}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip label={decision.action} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                            {(decision.labels || []).map(v => (
                              <Chip key={`${decision.id}-${v}`} label={v} size="small" />
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={decision.protocols || 'none'}
                            color={protocolColor(decision.protocols) as 'default' | 'success' | 'info'}
                            size="small"
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell>
                          {decision.revoked ? (
                            <Chip label="revoked" size="small" color="warning" />
                          ) : (
                            <Chip label="active" size="small" color="success" variant="outlined" />
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            color="warning"
                            disabled={Boolean(decision.revoked)}
                            onClick={() => revokeDecision(decision.id)}
                          >
                            Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}

          {tab === 3 &&
            (labels.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                No AT labels emitted yet.
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>Timestamp</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Subject</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Value</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Source DID</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Mode</strong>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {labels.map((label, idx) => (
                      <TableRow key={`${label.uri}-${label.val}-${label.cts}-${idx}`} hover>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {new Date(label.cts).toLocaleString()}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {label.uri}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={label.val} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                            {label.src}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={label.neg ? 'negation' : 'assertion'}
                            color={label.neg ? 'warning' : 'info'}
                            variant="outlined"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ))}

          {tab === 4 && (
            <Stack spacing={2}>
              <Alert severity={fediseerStatus?.configured ? 'info' : 'warning'}>
                <Stack spacing={0.5}>
                  <Typography variant="body2" fontWeight={600}>
                    Fediseer trust import
                  </Typography>
                  <Typography variant="body2">
                    Import selected Fediseer censures and hesitations into live ActivityPub domain rules. This is most
                    useful for bringing trusted instance-level reputation into exact inbound AP enforcement.
                  </Typography>
                  <Typography variant="body2">
                    Service:{' '}
                    {fediseerStatus?.configured ? fediseerStatus.serviceBaseUrl || 'Configured' : 'Not configured'}
                  </Typography>
                  <Typography variant="body2">
                    Trusted sources:{' '}
                    {fediseerStatus?.sourceDomains?.length
                      ? fediseerStatus.sourceDomains.join(', ')
                      : 'None configured yet'}
                  </Typography>
                </Stack>
              </Alert>

              <TextField
                label="Fediseer source domains"
                value={fediseerSourceDomainsInput}
                onChange={e => setFediseerSourceDomainsInput(e.target.value)}
                placeholder="beehaw.org, lemmy.world"
                helperText="Leave blank to use enabled Fediseer trust sources from the trust-sources page."
                fullWidth
              />

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControl fullWidth>
                  <InputLabel id="fediseer-censure-action-label">Censure action</InputLabel>
                  <Select
                    labelId="fediseer-censure-action-label"
                    label="Censure action"
                    value={fediseerCensureAction}
                    onChange={e => setFediseerCensureAction(e.target.value as 'reject' | 'filter')}
                  >
                    <MenuItem value="reject">Reject</MenuItem>
                    <MenuItem value="filter">Filter</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel id="fediseer-hesitation-action-label">Hesitation action</InputLabel>
                  <Select
                    labelId="fediseer-hesitation-action-label"
                    label="Hesitation action"
                    value={fediseerHesitationAction}
                    onChange={e => setFediseerHesitationAction(e.target.value as 'filter' | 'reject')}
                  >
                    <MenuItem value="filter">Filter</MenuItem>
                    <MenuItem value="reject">Reject</MenuItem>
                  </Select>
                </FormControl>
              </Stack>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={fediseerIncludeCensures}
                      onChange={e => setFediseerIncludeCensures(e.target.checked)}
                    />
                  }
                  label="Include censures"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={fediseerIncludeHesitations}
                      onChange={e => setFediseerIncludeHesitations(e.target.checked)}
                    />
                  }
                  label="Include hesitations"
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={fediseerReplaceExisting}
                      onChange={e => setFediseerReplaceExisting(e.target.checked)}
                    />
                  }
                  label="Replace previous Fediseer-managed rules"
                />
              </Stack>

              <Stack direction="row" spacing={2}>
                <Button variant="outlined" onClick={() => runFediseerSync(false)} disabled={fediseerSyncLoading}>
                  {fediseerSyncLoading ? 'Loading…' : 'Preview import'}
                </Button>
                <Button variant="contained" onClick={() => runFediseerSync(true)} disabled={fediseerSyncLoading}>
                  {fediseerSyncLoading ? 'Applying…' : 'Apply to AP domain rules'}
                </Button>
              </Stack>

              {fediseerEntries.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No Fediseer preview loaded yet.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <strong>Domain</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Action</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Signals</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Sources</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Reasons</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fediseerEntries.map(entry => (
                        <TableRow key={entry.ruleId} hover>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {entry.targetDomain}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={entry.action}
                              color={entry.action === 'reject' ? 'warning' : 'info'}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{entry.signals.join(', ')}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">{entry.sourceDomains.join(', ')}</Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {entry.reasons.length > 0 ? entry.reasons.join(', ') : entry.reason}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          )}

          {tab === 5 && (
            <Stack spacing={2}>
              <Alert severity={pdqStatus?.configured ? 'info' : 'warning'}>
                <Stack spacing={0.5}>
                  <Typography variant="body2" fontWeight={600}>
                    PieFed-style PDQ blocked-image matching
                  </Typography>
                  <Typography variant="body2">
                    We hash public image URLs through a PieFed-compatible PDQ service, then compare new media against
                    this blocklist in the `media-policy` MRF module.
                  </Typography>
                  <Typography variant="body2">
                    Service: {pdqStatus?.configured ? pdqStatus.serviceBaseUrl || 'Configured' : 'Not configured'}
                  </Typography>
                  <Typography variant="body2">
                    Current defaults: quality {'>='} {minPdqQuality} and Hamming distance {'<'} {pdqHammingThreshold}.
                  </Typography>
                </Stack>
              </Alert>

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  label="Image URL to hash"
                  value={pdqLookupImageUrl}
                  onChange={e => setPdqLookupImageUrl(e.target.value)}
                  placeholder="https://example.com/path/to/image.jpg"
                  fullWidth
                />
                <Button
                  variant="contained"
                  onClick={lookupPdqHash}
                  disabled={pdqLookupLoading || !pdqStatus?.configured}
                >
                  {pdqLookupLoading ? 'Hashing…' : 'Hash image URL'}
                </Button>
              </Stack>

              {pdqLookupResult && (
                <Alert severity={pdqLookupResult.quality >= minPdqQuality ? 'success' : 'warning'}>
                  <Stack spacing={1}>
                    <Typography variant="body2">
                      Quality: <strong>{pdqLookupResult.quality}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                      {pdqLookupResult.pdqHashBinary}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button variant="contained" onClick={addPdqHashToBlocklist} disabled={pdqSaving}>
                        Add to blocked images
                      </Button>
                    </Stack>
                  </Stack>
                </Alert>
              )}

              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-end' }}>
                <TextField
                  label="Minimum PDQ quality"
                  type="number"
                  value={minPdqQuality}
                  onChange={e => setMinPdqQuality(clampInt(e.target.value, DEFAULT_PDQ_QUALITY, 0, 100))}
                  inputProps={{ min: 0, max: 100, step: 1 }}
                  helperText="PieFed currently treats hashes as usable when quality is at least 70."
                  fullWidth
                />
                <TextField
                  label="PDQ Hamming threshold"
                  type="number"
                  value={pdqHammingThreshold}
                  onChange={e => setPdqHammingThreshold(clampInt(e.target.value, DEFAULT_PDQ_THRESHOLD, 0, 256))}
                  inputProps={{ min: 0, max: 256, step: 1 }}
                  helperText="PieFed documents images as matching when distance stays below 15."
                  fullWidth
                />
                <Button variant="outlined" onClick={savePdqThresholds} disabled={pdqSaving}>
                  {pdqSaving ? 'Saving…' : 'Save PDQ settings'}
                </Button>
              </Stack>

              <Stack spacing={1.5}>
                <TextField
                  label="Bulk import PDQ hashes"
                  value={pdqImportText}
                  onChange={e => setPdqImportText(e.target.value)}
                  placeholder="Paste hashes, a JSON array, or exported `blocked_image` rows here"
                  multiline
                  minRows={5}
                  fullWidth
                  helperText="Useful if you export `blocked_image` rows from a PieFed instance or collect hashes elsewhere. Hex values are converted to binary automatically."
                />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button variant="outlined" onClick={importPdqHashes} disabled={pdqSaving}>
                    Import pasted hashes
                  </Button>
                  <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                    Detected hashes are deduplicated before saving.
                  </Typography>
                </Stack>
              </Stack>

              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip label={`MRF mode: ${mediaPolicyState?.mode || 'unknown'}`} size="small" variant="outlined" />
                <Chip label={`Blocked action: ${String(currentBlockedAction)}`} size="small" variant="outlined" />
                <Chip label={`Blocked hashes: ${blockedPdqHashes.length}`} size="small" variant="outlined" />
              </Stack>

              {blockedPdqHashes.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  No blocked PDQ hashes yet.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <strong>PDQ hash</strong>
                        </TableCell>
                        <TableCell align="right">
                          <strong>Ops</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {blockedPdqHashes.map(hash => (
                        <TableRow key={hash} hover>
                          <TableCell>
                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                              {truncatePdqHash(hash)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Button
                              size="small"
                              color="warning"
                              disabled={pdqSaving}
                              onClick={() => removePdqHashFromBlocklist(hash)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Stack>
          )}
        </>
      )}
    </Box>
  );
};

export default ProviderCrossProtocolModerationPage;
