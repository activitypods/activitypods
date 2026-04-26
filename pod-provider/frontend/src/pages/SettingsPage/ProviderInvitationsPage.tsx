import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BlockIcon from '@mui/icons-material/Block';
import AddIcon from '@mui/icons-material/Add';
import { dashboardApi } from './dashboardApi';

type Invitation = {
  id: string;
  token: string;
  maxUses: number | null;
  uses: number;
  expiresAt: string | null;
  note: string | null;
  revoked: boolean;
  revokedAt?: string;
  createdAt: string;
  createdBy: string;
};

type FormState = {
  maxUses: string;
  expiresAt: string;
  note: string;
};

const EMPTY_FORM: FormState = { maxUses: '', expiresAt: '', note: '' };

const invitationStatus = (inv: Invitation): { label: string; color: 'success' | 'warning' | 'error' | 'default' } => {
  if (inv.revoked) return { label: 'Revoked', color: 'error' };
  if (inv.expiresAt && inv.expiresAt < new Date().toISOString()) return { label: 'Expired', color: 'default' };
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) return { label: 'Used up', color: 'warning' };
  return { label: 'Active', color: 'success' };
};

export const ProviderInvitationsPage: React.FC = () => {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.listInvitations();
      setInvitations(result?.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load invitations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await dashboardApi.createInvitation({
        maxUses: form.maxUses ? parseInt(form.maxUses, 10) : undefined,
        expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : undefined,
        note: form.note || undefined
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create invitation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await dashboardApi.revokeInvitation(revokeTarget);
      setRevokeTarget(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invitation');
    } finally {
      setRevoking(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(token);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  return (
    <Box sx={{ p: 3, maxWidth: 760 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Invite Tokens
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Control pod registration with single-use or limited-use invite codes — inspired by Akkoma's invitation
            system.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          Generate
        </Button>
      </Stack>

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
      ) : invitations.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No invite tokens yet. Generate one to control who can create a pod.
        </Typography>
      ) : (
        <Stack spacing={2}>
          {invitations.map(inv => {
            const status = invitationStatus(inv);
            const isActive = status.label === 'Active';
            return (
              <Box
                key={inv.id}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 2,
                  p: 2,
                  opacity: isActive ? 1 : 0.6
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip label={status.label} size="small" color={status.color} />
                      {inv.note && (
                        <Typography variant="caption" color="text.secondary">
                          {inv.note}
                        </Typography>
                      )}
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      >
                        {inv.token}
                      </Typography>
                      <Tooltip title={copied === inv.token ? 'Copied!' : 'Copy token'}>
                        <IconButton size="small" onClick={() => copyToken(inv.token)}>
                          <ContentCopyIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>

                    <Stack direction="row" spacing={2}>
                      <Typography variant="caption" color="text.secondary">
                        Uses: {inv.uses}
                        {inv.maxUses !== null ? ` / ${inv.maxUses}` : ' (unlimited)'}
                      </Typography>
                      {inv.expiresAt && (
                        <Typography variant="caption" color="text.secondary">
                          Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                        </Typography>
                      )}
                      <Typography variant="caption" color="text.secondary">
                        Created: {new Date(inv.createdAt).toLocaleDateString()}
                      </Typography>
                    </Stack>
                  </Box>

                  {isActive && (
                    <Tooltip title="Revoke invitation">
                      <IconButton size="small" color="error" onClick={() => setRevokeTarget(inv.id)}>
                        <BlockIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Stack>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Generate Invite Token</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Note (optional)"
              fullWidth
              placeholder="e.g. 'For beta testers'"
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              inputProps={{ maxLength: 500 }}
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Max uses (blank = unlimited)"
                type="number"
                fullWidth
                value={form.maxUses}
                onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))}
                inputProps={{ min: 1, max: 1000 }}
              />
              <TextField
                label="Expires at (optional)"
                type="datetime-local"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.expiresAt}
                onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={submitting}>
            {submitting ? <CircularProgress size={18} /> : 'Generate'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Revoke confirm dialog */}
      <Dialog open={!!revokeTarget} onClose={() => !revoking && setRevokeTarget(null)}>
        <DialogTitle>Revoke Invitation?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This token will no longer be usable for registration. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeTarget(null)} disabled={revoking}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleRevoke} disabled={revoking}>
            {revoking ? <CircularProgress size={18} /> : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderInvitationsPage;
