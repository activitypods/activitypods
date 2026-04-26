import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import Header from '../../common/Header';
import { dashboardApi } from './dashboardApi';
import {
  caseAuthorityLabel,
  caseForwardingBadges,
  caseForwardingNotes,
  caseStatusColor,
  caseSubjectKindLabel,
  caseTargetLines,
  decisionEnforcementLines,
  describeCaseSource,
  protocolColor,
  type ModerationCase,
  type ModerationDecision
} from './moderationUi';

const OwnerModerationPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cases, setCases] = useState<ModerationCase[]>([]);
  const [decisions, setDecisions] = useState<ModerationDecision[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [caseResult, decisionResult] = await Promise.all([
        dashboardApi.listMyModerationCases({ limit: 200 }),
        dashboardApi.listMyModerationDecisions({ limit: 200 })
      ]);

      setCases(caseResult?.data || []);
      setDecisions(decisionResult?.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load moderation activity.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  return (
    <>
      <Header title="app.titles.settings" />
      <Box sx={{ p: 3, maxWidth: 1200 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" gutterBottom>
              Reports & moderation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Reports you file from ActivityPods apps land here first, and moderation actions targeting your pod
              identity show up here too. Apps can also read the same pod-backed state through the moderation API.
            </Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Button variant="outlined" onClick={() => navigate('/settings/moderation')}>
              Open moderation lists
            </Button>
            <Button variant="outlined" onClick={loadAll}>
              Refresh
            </Button>
          </Stack>
        </Stack>

        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            App API surfaces: <strong>`/api/moderation/reports`</strong> for reports you filed and{' '}
            <strong>`/api/moderation/actions`</strong> for actions affecting you. Apps that subscribe to the private{' '}
            <strong>`notifications`</strong> stream can also receive moderation update events as this state changes.
          </Typography>
        </Alert>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Divider sx={{ mb: 2 }} />

        <Tabs value={tab} onChange={(_, next) => setTab(next)} sx={{ mb: 2 }}>
          <Tab label="My reports" />
          <Tab label="Actions affecting me" />
        </Tabs>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            {tab === 0 &&
              (cases.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No reports filed from this pod yet.
                </Typography>
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          <strong>Submitted</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Source</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Target</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Status</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Delivery</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Reason</strong>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {cases.map(entry => {
                        const forwardingBadges = caseForwardingBadges(entry);
                        const forwardingNotes = caseForwardingNotes(entry);
                        return (
                          <TableRow key={entry.id} hover>
                            <TableCell>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                {new Date(entry.receivedAt).toLocaleString()}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption" color="text.secondary">
                                {describeCaseSource(entry)}
                              </Typography>
                              {entry.clientContext?.app && (
                                <Typography variant="caption" display="block" color="text.secondary">
                                  via {entry.clientContext.app}
                                  {entry.clientContext.surface ? ` • ${entry.clientContext.surface}` : ''}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Stack spacing={0.25}>
                                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                                  <Chip label={caseSubjectKindLabel(entry)} size="small" variant="outlined" />
                                  <Chip
                                    label={caseAuthorityLabel(entry)}
                                    size="small"
                                    variant="outlined"
                                    color="info"
                                  />
                                </Stack>
                                {caseTargetLines(entry)
                                  .slice(0, 3)
                                  .map(line => (
                                    <Typography
                                      key={`${entry.id}-${line}`}
                                      variant="caption"
                                      sx={{ fontFamily: 'monospace' }}
                                    >
                                      {line}
                                    </Typography>
                                  ))}
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
                              <Stack spacing={0.75}>
                                <Typography variant="caption" color="text.secondary">
                                  {entry.requestedForwarding?.remote ? 'Remote forwarding requested' : 'Stored locally'}
                                </Typography>
                                <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                                  {forwardingBadges.length > 0 ? (
                                    forwardingBadges.map(badge => (
                                      <Chip
                                        key={badge.key}
                                        label={badge.label}
                                        size="small"
                                        color={badge.color as 'default' | 'success' | 'info' | 'warning' | 'error'}
                                        variant="outlined"
                                      />
                                    ))
                                  ) : (
                                    <Typography variant="caption" color="text.secondary">
                                      Stored locally
                                    </Typography>
                                  )}
                                </Stack>
                                {forwardingNotes.slice(0, 2).map(note => (
                                  <Typography
                                    key={`${entry.id}-note-${note}`}
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{ wordBreak: 'break-word' }}
                                  >
                                    {note}
                                  </Typography>
                                ))}
                              </Stack>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">{entry.reason || 'No reason text provided.'}</Typography>
                              <Typography variant="caption" display="block" color="text.secondary">
                                {entry.reasonType}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              ))}

            {tab === 1 &&
              (decisions.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
                  No moderation actions currently target this pod identity.
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
                          <strong>Action</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Target</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Propagation</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Enforcement</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Status</strong>
                        </TableCell>
                        <TableCell>
                          <strong>Reason</strong>
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
                            <Chip label={decision.action} size="small" variant="outlined" />
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
                            <Chip
                              label={decision.protocols || 'none'}
                              color={protocolColor(decision.protocols) as 'default' | 'success' | 'info'}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell>
                            <Stack spacing={0.25}>
                              {decisionEnforcementLines(decision).map(line => (
                                <Typography
                                  key={`${decision.id}-enforcement-${line}`}
                                  variant="caption"
                                  color="text.secondary"
                                >
                                  {line}
                                </Typography>
                              ))}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {decision.revoked ? (
                              <Chip label="revoked" size="small" color="warning" />
                            ) : (
                              <Chip label="active" size="small" color="success" variant="outlined" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Typography variant="caption">
                              {decision.reason || 'No moderator note provided.'}
                            </Typography>
                            {decision.sourceCaseId && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                linked report: {decision.sourceCaseId}
                              </Typography>
                            )}
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
    </>
  );
};

export default OwnerModerationPage;
