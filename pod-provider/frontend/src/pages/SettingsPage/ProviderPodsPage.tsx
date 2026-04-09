import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { dashboardApi } from './dashboardApi';

type Pod = {
  webId: string;
  username?: string;
  email?: string;
  createdAt?: string;
  suspended?: boolean;
};

export const ProviderPodsPage: React.FC = () => {
  const [pods, setPods] = useState<Pod[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.listProviderPods();
      setPods(result?.data ?? []);
      setTotal(result?.total ?? result?.data?.length ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load pod directory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = pods.filter(p => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.webId.toLowerCase().includes(q) ||
      (p.username ?? '').toLowerCase().includes(q) ||
      (p.email ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <Box sx={{ p: 3, maxWidth: 900 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" gutterBottom>
          Pod Directory
        </Typography>
        <Typography variant="body2" color="text.secondary">
          All pods hosted on this provider instance.
          {!loading && ` ${total} total.`}
        </Typography>
      </Box>

      <Divider sx={{ mb: 3 }} />

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <TextField
        placeholder="Search by WebID, username or email…"
        size="small"
        fullWidth
        sx={{ mb: 2 }}
        value={search}
        onChange={e => setSearch(e.target.value)}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          )
        }}
      />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          {search ? 'No pods match your search.' : 'No pods found.'}
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <strong>WebID / Username</strong>
                </TableCell>
                <TableCell>
                  <strong>Email</strong>
                </TableCell>
                <TableCell>
                  <strong>Created</strong>
                </TableCell>
                <TableCell>
                  <strong>Status</strong>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(pod => (
                <TableRow key={pod.webId} hover>
                  <TableCell>
                    <Stack>
                      <Typography
                        variant="body2"
                        component="a"
                        href={pod.webId}
                        target="_blank"
                        rel="noreferrer noopener"
                        sx={{
                          color: 'primary.main',
                          textDecoration: 'none',
                          '&:hover': { textDecoration: 'underline' }
                        }}
                      >
                        {pod.webId}
                      </Typography>
                      {pod.username && (
                        <Typography variant="caption" color="text.secondary">
                          @{pod.username}
                        </Typography>
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {pod.email ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {pod.createdAt ? new Date(pod.createdAt).toLocaleDateString() : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={pod.suspended ? 'Suspended' : 'Active'}
                      size="small"
                      color={pod.suspended ? 'error' : 'success'}
                    />
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

export default ProviderPodsPage;
