import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
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

type ModerationDecision = {
  id: string;
  appliedAt: string;
  appliedBy: string;
  action: ModerationAction;
  labels: string[];
  targetWebId?: string;
  targetAtDid?: string;
  targetHandle?: string;
  reason?: string;
  protocols?: 'none' | 'ap' | 'at' | 'both';
  revoked?: boolean;
};

type AtLabel = {
  src: string;
  uri: string;
  val: string;
  cts: string;
  neg?: boolean;
};

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

export const ProviderCrossProtocolModerationPage: React.FC = () => {
  const [tab, setTab] = useState(0);

  const [targetWebId, setTargetWebId] = useState('');
  const [targetAtDid, setTargetAtDid] = useState('');
  const [targetHandle, setTargetHandle] = useState('');
  const [action, setAction] = useState<ModerationAction>('warn');
  const [labelsInput, setLabelsInput] = useState('');
  const [reason, setReason] = useState('');

  const [knownLabels, setKnownLabels] = useState<string[]>(DEFAULT_AT_LABELS);

  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [decisions, setDecisions] = useState<ModerationDecision[]>([]);
  const [labels, setLabels] = useState<AtLabel[]>([]);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [decisionResult, labelResult, knownResult] = await Promise.all([
        dashboardApi.listModerationDecisions({ limit: 200 }),
        dashboardApi.listAtLabels({ limit: 200 }),
        dashboardApi.listKnownAtLabels().catch(() => null)
      ]);

      setDecisions(decisionResult?.data || decisionResult?.decisions || []);
      setLabels(labelResult?.labels || []);

      const remoteLabels = knownResult?.globalLabels;
      if (Array.isArray(remoteLabels) && remoteLabels.length > 0) {
        setKnownLabels(remoteLabels);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const resetForm = () => {
    setTargetWebId('');
    setTargetAtDid('');
    setTargetHandle('');
    setAction('warn');
    setLabelsInput('');
    setReason('');
  };

  const submitDecision = async () => {
    setError(null);
    setSuccess(null);

    if (!targetWebId.trim() && !targetAtDid.trim() && !targetHandle.trim()) {
      setError('Provide at least one target: WebID, AT DID, or handle');
      return;
    }

    setSubmitting(true);
    try {
      const response = await dashboardApi.applyModerationDecision({
        targetWebId: targetWebId.trim() || undefined,
        targetAtDid: targetAtDid.trim() || undefined,
        targetHandle: targetHandle.trim() || undefined,
        action,
        labels: parsedLabels,
        reason: reason.trim() || undefined
      });

      const decision = response?.decision;
      if (decision) {
        setDecisions(prev => [decision, ...prev.filter(d => d.id !== decision.id)]);
      }
      setSuccess('Moderation decision applied across protocols');
      resetForm();
      await loadAll();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to apply moderation decision');
    } finally {
      setSubmitting(false);
    }
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

  return (
    <Box sx={{ p: 3, maxWidth: 1200 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Cross-Protocol Moderation
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Apply moderation decisions once and propagate them across ActivityPub (MRF) and ATProto (Bluesky-compatible
          labels).
        </Typography>
      </Box>

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
        <Tab label="Decision history" />
        <Tab label="AT labels" />
      </Tabs>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {tab === 0 && (
            <Stack spacing={2}>
              <TextField
                label="Target WebID"
                value={targetWebId}
                onChange={e => setTargetWebId(e.target.value)}
                placeholder="https://pod.example/u/alice"
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

          {tab === 2 &&
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
        </>
      )}
    </Box>
  );
};

export default ProviderCrossProtocolModerationPage;
