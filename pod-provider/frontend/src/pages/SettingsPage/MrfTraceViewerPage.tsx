import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
  FormControlLabel
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import ScienceIcon from '@mui/icons-material/Science';
import InsightsIcon from '@mui/icons-material/Insights';
import { dashboardApi } from './dashboardApi';

type TraceAction = 'accept' | 'label' | 'downrank' | 'filter' | 'reject';
type TraceMode = 'disabled' | 'dry-run' | 'enforce';

type TraceStep = {
  traceId: string;
  requestId?: string;
  activityId?: string;
  actorId?: string;
  originHost?: string;
  visibility?: string;
  moduleId: string;
  mode: TraceMode;
  action: TraceAction;
  confidence?: number;
  labels?: string[];
  reason?: string;
  createdAt: string;
  redacted?: boolean;
};

type TraceChain = {
  traceId: string;
  requestId?: string;
  activityId?: string;
  moduleId?: string;
  finalAction?: TraceAction;
  steps: TraceStep[];
};

type TraceSuggestion = {
  field: string;
  type: 'increase' | 'decrease' | 'toggle' | 'add' | 'remove';
  suggestedValue: unknown;
  rationale: string;
};

type TraceSuggestionsResponse = {
  moduleId: string;
  traceId: string;
  activityId?: string;
  signals?: {
    action?: string;
    confidence?: number;
    labels?: string[];
    reason?: string;
  };
  suggestions: TraceSuggestion[];
};

type TraceFilters = {
  moduleId: string;
  action: '' | TraceAction;
  originHost: string;
  activityId: string;
};

type MetricsPayload = {
  totals?: {
    decisions: number;
    byAction: Record<string, number>;
    byModule: Record<string, number>;
  };
  alerts?: Array<{ level: string; code: string; message: string }>;
};

const ACTION_COLOR: Record<TraceAction, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  accept: 'success',
  label: 'info',
  downrank: 'warning',
  filter: 'warning',
  reject: 'error'
};

const initialFilters: TraceFilters = {
  moduleId: '',
  action: '',
  originHost: '',
  activityId: ''
};

const formatConfidence = (value?: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return '-';
  return value.toFixed(2);
};

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const safeMode = (mode?: string): TraceMode => {
  if (mode === 'disabled' || mode === 'dry-run' || mode === 'enforce') {
    return mode;
  }
  return 'dry-run';
};

const toFriendlyError = (message?: string, fallback?: string) => {
  if (!message || !message.trim()) return fallback || 'Something went wrong.';

  const normalized = message.trim();
  if (normalized.toLowerCase().includes('mrf control plane is not configured')) {
    return 'Post filtering is not set up yet. Connect the filtering service to start using this page.';
  }

  return normalized;
};

const TraceDecisionCard = ({
  step,
  onFilterSimilar
}: {
  step: TraceStep;
  onFilterSimilar: (step: TraceStep) => void;
}) => {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" fontWeight={700}>
            {step.moduleId}
          </Typography>
          <Chip size="small" variant="outlined" label={safeMode(step.mode)} />
          <Chip size="small" color={ACTION_COLOR[step.action]} label={step.action} />
        </Stack>
        <Typography variant="caption" color="text.secondary">
          {formatDateTime(step.createdAt)}
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={1}>
        <Typography variant="body2">
          Confidence: <strong>{formatConfidence(step.confidence)}</strong>
        </Typography>
        <Typography variant="body2">Visibility: {step.visibility || 'unknown'}</Typography>
        <Typography variant="body2">Host: {step.originHost || '-'}</Typography>
      </Stack>

      {Array.isArray(step.labels) && step.labels.length > 0 && (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" mb={1}>
          {step.labels.map(label => (
            <Chip key={label} size="small" variant="outlined" label={label} />
          ))}
        </Stack>
      )}

      {step.reason && (
        <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, p: 1, mb: 1 }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
            Reason
          </Typography>
          <Typography component="pre" variant="body2" sx={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {step.reason}
          </Typography>
        </Box>
      )}

      <Button size="small" variant="text" onClick={() => onFilterSimilar(step)}>
        Filter similar activity
      </Button>
    </Paper>
  );
};

const MrfTraceViewerPage = () => {
  const navigate = useNavigate();
  const { traceId } = useParams();

  const [filters, setFilters] = useState<TraceFilters>(initialFilters);
  const [traces, setTraces] = useState<TraceStep[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [includePrivate, setIncludePrivate] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [traceChain, setTraceChain] = useState<TraceChain | null>(null);
  const [traceSuggestions, setTraceSuggestions] = useState<TraceSuggestionsResponse | null>(null);

  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);

  const [simulatePending, setSimulatePending] = useState(false);

  const activeTrace = useMemo(() => {
    if (!traceId) return null;
    return traces.find(t => t.traceId === traceId) || traceChain?.steps?.find(t => t.traceId === traceId) || null;
  }, [traceId, traces, traceChain]);

  const toListQuery = useCallback(
    (cursor?: string) => ({
      limit: 25,
      ...(cursor ? { cursor } : {}),
      ...(filters.moduleId ? { moduleId: filters.moduleId } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.originHost ? { originHost: filters.originHost } : {}),
      ...(filters.activityId ? { activityId: filters.activityId } : {}),
      ...(includePrivate ? { includePrivate: true } : {})
    }),
    [filters, includePrivate]
  );

  const loadTraces = useCallback(
    async (reset = true) => {
      setListLoading(true);
      setListError(null);
      try {
        const cursor = reset ? undefined : nextCursor;
        const res = await dashboardApi.listMrfTraces(toListQuery(cursor));
        const items = (res?.data || []) as TraceStep[];
        setTraces(prev => (reset ? items : [...prev, ...items]));
        setNextCursor(res?.nextCursor);
      } catch (e: any) {
        setListError(toFriendlyError(e?.message, 'Could not load recent activity.'));
      } finally {
        setListLoading(false);
      }
    },
    [nextCursor, toListQuery]
  );

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await dashboardApi.getMrfMetrics({
        maxItems: 1000,
        ...(filters.moduleId ? { moduleId: filters.moduleId } : {}),
        ...(filters.action ? { action: filters.action } : {}),
        ...(filters.originHost ? { originHost: filters.originHost } : {})
      });
      setMetrics(res?.data || null);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, [filters]);

  const loadTraceDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const [chainRes, suggestionsRes] = await Promise.all([
          dashboardApi.getMrfTraceChain(id, includePrivate),
          dashboardApi.getMrfTraceSuggestions(id)
        ]);

        const chain = chainRes?.data as TraceChain;
        setTraceChain(chain);
        setTraceSuggestions((suggestionsRes?.data || null) as TraceSuggestionsResponse | null);
      } catch (e: any) {
        setDetailError(toFriendlyError(e?.message, 'Could not load activity details.'));
        setTraceChain(null);
        setTraceSuggestions(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [includePrivate]
  );

  useEffect(() => {
    loadTraces(true);
    loadMetrics();
  }, [loadTraces, loadMetrics]);

  useEffect(() => {
    if (!traceId) {
      setTraceChain(null);
      setTraceSuggestions(null);
      return;
    }

    loadTraceDetail(traceId);
  }, [traceId, loadTraceDetail]);

  const handleApplyFilters = async () => {
    await loadTraces(true);
    await loadMetrics();
  };

  const openTrace = (id: string) => {
    navigate(`/settings/mrf/traces/${encodeURIComponent(id)}`);
  };

  const handleTogglePrivate = async (checked: boolean) => {
    if (checked) {
      const confirmed = window.confirm(
        'Raw payloads may contain sensitive information. Only continue if you are authorized for private trace data.'
      );
      if (!confirmed) return;
    }

    setIncludePrivate(checked);
  };

  const handleSimulate = async () => {
    const activityId = traceChain?.activityId || activeTrace?.activityId;
    if (!activityId) return;

    setSimulatePending(true);
    setDetailError(null);
    try {
      await dashboardApi.createMrfSimulation({ activityId });
    } catch (e: any) {
      setDetailError(toFriendlyError(e?.message, 'Could not start a simulation run.'));
    } finally {
      setSimulatePending(false);
    }
  };

  const handleOpenModuleConfig = () => {
    const moduleId = traceSuggestions?.moduleId || activeTrace?.moduleId;
    if (!moduleId) return;

    if (traceSuggestions && traceSuggestions.suggestions?.length > 0) {
      const tune = encodeURIComponent(JSON.stringify(traceSuggestions));
      navigate(`/settings/mrf/${encodeURIComponent(moduleId)}?tune=${tune}`);
      return;
    }

    navigate(`/settings/mrf/${encodeURIComponent(moduleId)}`);
  };

  const handleFilterSimilar = (step: TraceStep) => {
    setFilters(prev => ({
      ...prev,
      moduleId: step.moduleId || prev.moduleId,
      action: (step.action as TraceAction) || prev.action,
      originHost: step.originHost || prev.originHost,
      activityId: step.activityId || prev.activityId
    }));
  };

  const topModules = useMemo(() => {
    const byModule = metrics?.totals?.byModule || {};
    return Object.entries(byModule)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 5);
  }, [metrics]);

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        Filter Activity Log
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        See how posts were handled, why each action happened, and jump to settings to fine-tune rules.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-end' }}>
          <TextField
            label="Filter ID"
            size="small"
            value={filters.moduleId}
            onChange={e => setFilters(prev => ({ ...prev, moduleId: e.target.value.trim() }))}
          />

          <FormControl size="small" sx={{ minWidth: 160 }}>
            <InputLabel>Action</InputLabel>
            <Select
              label="Action"
              value={filters.action}
              onChange={e => setFilters(prev => ({ ...prev, action: e.target.value as TraceFilters['action'] }))}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="reject">Reject</MenuItem>
              <MenuItem value="filter">Filter</MenuItem>
              <MenuItem value="downrank">Downrank</MenuItem>
              <MenuItem value="label">Label</MenuItem>
              <MenuItem value="accept">Accept</MenuItem>
            </Select>
          </FormControl>

          <TextField
            label="From server"
            size="small"
            value={filters.originHost}
            onChange={e => setFilters(prev => ({ ...prev, originHost: e.target.value.trim() }))}
          />

          <TextField
            label="Post ID"
            size="small"
            value={filters.activityId}
            onChange={e => setFilters(prev => ({ ...prev, activityId: e.target.value.trim() }))}
            sx={{ minWidth: 280 }}
          />

          <FormControlLabel
            control={<Switch checked={includePrivate} onChange={e => handleTogglePrivate(e.target.checked)} />}
            label="Show technical details"
          />

          <Button variant="contained" onClick={handleApplyFilters}>
            Apply filters
          </Button>
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <InsightsIcon fontSize="small" />
            <Typography variant="subtitle2">Quick stats</Typography>
            {metricsLoading && <CircularProgress size={14} />}
          </Stack>

          <Typography variant="body2">Total actions: {metrics?.totals?.decisions ?? '-'}</Typography>

          <Stack direction="row" spacing={0.5} flexWrap="wrap">
            {topModules.map(([moduleId, count]) => (
              <Chip key={moduleId} size="small" variant="outlined" label={`${moduleId}: ${count}`} />
            ))}
          </Stack>
        </Stack>

        {Array.isArray(metrics?.alerts) && metrics!.alerts!.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {metrics!.alerts![0].message}
          </Alert>
        )}
      </Paper>

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="flex-start">
        <Box width={{ xs: '100%', lg: '46%' }}>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={600} mb={1}>
              Recent activity
            </Typography>

            {listError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {listError}
              </Alert>
            )}

            {listLoading && traces.length === 0 ? (
              <CircularProgress size={20} />
            ) : (
              <Stack spacing={1}>
                {traces.map(trace => (
                  <Paper
                    key={trace.traceId}
                    variant="outlined"
                    sx={{
                      p: 1,
                      cursor: 'pointer',
                      borderColor: trace.traceId === traceId ? 'primary.main' : 'divider'
                    }}
                    onClick={() => openTrace(trace.traceId)}
                  >
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        {formatDateTime(trace.createdAt)}
                      </Typography>
                      <Chip size="small" color={ACTION_COLOR[trace.action]} label={trace.action} />
                    </Stack>
                    <Typography variant="body2" fontWeight={600}>
                      {trace.moduleId}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {trace.originHost || '-'} · mode: {safeMode(trace.mode)} · confidence:{' '}
                      {formatConfidence(trace.confidence)}
                    </Typography>
                  </Paper>
                ))}

                {nextCursor && (
                  <Button variant="outlined" disabled={listLoading} onClick={() => loadTraces(false)}>
                    Show more
                  </Button>
                )}
              </Stack>
            )}
          </Paper>
        </Box>

        <Box width={{ xs: '100%', lg: '54%' }}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
              <Typography variant="subtitle1" fontWeight={600}>
                Activity details
              </Typography>
              {traceId && (
                <Typography variant="caption" color="text.secondary">
                  Trace ID: {traceId}
                </Typography>
              )}
            </Stack>

            {detailError && (
              <Alert severity="error" sx={{ mb: 1 }}>
                {detailError}
              </Alert>
            )}

            {!traceId && <Alert severity="info">Pick an item from the left to see what happened.</Alert>}

            {traceId && detailLoading && <CircularProgress size={20} />}

            {traceId && !detailLoading && traceChain && (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} mb={2}>
                  <Button
                    variant="contained"
                    startIcon={<ScienceIcon />}
                    disabled={simulatePending || !(traceChain.activityId || activeTrace?.activityId)}
                    onClick={handleSimulate}
                  >
                    {simulatePending ? 'Running simulation…' : 'Test this activity'}
                  </Button>

                  <Button
                    variant="outlined"
                    startIcon={<OpenInNewIcon />}
                    onClick={handleOpenModuleConfig}
                    disabled={!(traceSuggestions?.moduleId || activeTrace?.moduleId)}
                  >
                    Open filter settings
                  </Button>

                  <Tooltip title="Future integration point for case management / escalation workflows">
                    <span>
                      <Button variant="text" disabled>
                        Create moderation case (coming soon)
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>

                {traceSuggestions &&
                  Array.isArray(traceSuggestions.suggestions) &&
                  traceSuggestions.suggestions.length > 0 && (
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2" fontWeight={600}>
                        Suggested changes
                      </Typography>
                      <Stack spacing={0.5} mt={0.5}>
                        {traceSuggestions.suggestions.map(suggestion => (
                          <Typography key={`${suggestion.field}:${suggestion.type}`} variant="body2">
                            {suggestion.field} {'->'} {String(suggestion.suggestedValue)} ({suggestion.rationale})
                          </Typography>
                        ))}
                      </Stack>
                    </Alert>
                  )}

                <Typography variant="body2" color="text.secondary" mb={1}>
                  Final action: <strong>{traceChain.finalAction || '-'}</strong> · Steps: {traceChain.steps.length}
                </Typography>

                <Divider sx={{ mb: 1.5 }} />

                <Stack spacing={1.5}>
                  {traceChain.steps.map(step => (
                    <TraceDecisionCard key={step.traceId} step={step} onFilterSimilar={handleFilterSimilar} />
                  ))}
                </Stack>
              </>
            )}
          </Paper>
        </Box>
      </Stack>
    </Box>
  );
};

export default MrfTraceViewerPage;
