import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  id_?: string;
  [key: string]: unknown;
};

const ACTION_COLORS: Record<string, 'info' | 'success' | 'warning' | 'error' | 'default'> = {
  create_announcement: 'success',
  delete_announcement: 'error',
  create_invitation: 'success',
  revoke_invitation: 'warning'
};

const actionLabel = (action: string) => action.replace(/_/g, ' ');

const detailSummary = (entry: AuditEntry): string => {
  const skip = new Set(['id', 'timestamp', 'actor', 'action']);
  const parts = Object.entries(entry)
    .filter(([k]) => !skip.has(k))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return parts || '—';
};

export const ProviderAuditLogPage: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.listAuditLog(200);
      setEntries(result?.data ?? []);
      setTotal(result?.total ?? result?.data?.length ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Box sx={{ p: 3, maxWidth: 1000 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Provider Audit Log
        </Typography>
        <Typography variant="body2" color="text.secondary">
          A record of all management actions taken by provider actors on this instance.
          {!loading && ` ${total} events stored.`}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : entries.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No audit events recorded yet.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: 180 }}>
                  <strong>Timestamp</strong>
                </TableCell>
                <TableCell>
                  <strong>Actor</strong>
                </TableCell>
                <TableCell>
                  <strong>Action</strong>
                </TableCell>
                <TableCell>
                  <strong>Details</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {entries.map(entry => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    <Tooltip title={entry.timestamp} placement="top">
                      <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                        {new Date(entry.timestamp).toLocaleString()}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="body2"
                      component="a"
                      href={entry.actor}
                      target="_blank"
                      rel="noreferrer noopener"
                      sx={{
                        color: 'primary.main',
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        '&:hover': { textDecoration: 'underline' }
                      }}
                    >
                      {entry.actor}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={actionLabel(entry.action)}
                      size="small"
                      color={ACTION_COLORS[entry.action] ?? 'default'}
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      <Typography variant="caption" color="text.secondary">
                        {detailSummary(entry)}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
};

export default ProviderAuditLogPage;
