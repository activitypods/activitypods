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
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { dashboardApi } from './dashboardApi';

type Announcement = {
  id: string;
  content: string;
  publishedAt: string;
  createdAt: string;
  createdBy: string;
  startsAt?: string | null;
  endsAt?: string | null;
  allDay?: boolean;
};

type FormState = {
  content: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
};

const EMPTY_FORM: FormState = { content: '', startsAt: '', endsAt: '', allDay: false };

export const ProviderAnnouncementsPage: React.FC = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dashboardApi.listAnnouncements();
      setAnnouncements(result?.data ?? []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.content.trim()) return;
    setSubmitting(true);
    try {
      await dashboardApi.createAnnouncement({
        content: form.content.trim(),
        startsAt: form.startsAt || undefined,
        endsAt: form.endsAt || undefined,
        allDay: form.allDay
      });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create announcement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await dashboardApi.deleteAnnouncement(deleteTarget);
      setDeleteTarget(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to delete announcement');
    } finally {
      setDeleting(false);
    }
  };

  const isActive = (a: Announcement) => {
    const now = new Date().toISOString();
    if (a.startsAt && a.startsAt > now) return false;
    if (a.endsAt && a.endsAt < now) return false;
    return true;
  };

  return (
    <Box sx={{ p: 3, maxWidth: 760 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="h6" gutterBottom>
            Platform Announcements
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Post notices visible to all pod users — maintenance windows, policy updates, or welcome messages.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
          New
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
      ) : announcements.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No announcements yet. Create one to notify all pod users.
        </Typography>
      ) : (
        <Stack spacing={2}>
          {announcements.map(a => (
            <Box key={a.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ flex: 1 }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                    <Chip
                      label={isActive(a) ? 'Active' : 'Inactive'}
                      size="small"
                      color={isActive(a) ? 'success' : 'default'}
                    />
                    {a.allDay && <Chip label="All-day" size="small" variant="outlined" />}
                    <Typography variant="caption" color="text.secondary">
                      {new Date(a.publishedAt).toLocaleString()}
                    </Typography>
                  </Stack>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {a.content}
                  </Typography>
                  {a.startsAt && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Starts: {new Date(a.startsAt).toLocaleString()}
                      {a.endsAt && ` · Ends: ${new Date(a.endsAt).toLocaleString()}`}
                    </Typography>
                  )}
                </Box>
                <Tooltip title="Delete announcement">
                  <IconButton size="small" color="error" onClick={() => setDeleteTarget(a.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>
          ))}
        </Stack>
      )}

      {/* Create dialog */}
      <Dialog open={dialogOpen} onClose={() => !submitting && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>New Announcement</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Content"
              multiline
              minRows={4}
              maxRows={12}
              fullWidth
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              inputProps={{ maxLength: 5000 }}
              helperText={`${form.content.length}/5000`}
              required
            />
            <Stack direction="row" spacing={2}>
              <TextField
                label="Starts at (optional)"
                type="datetime-local"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.startsAt}
                onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))}
              />
              <TextField
                label="Ends at (optional)"
                type="datetime-local"
                fullWidth
                InputLabelProps={{ shrink: true }}
                value={form.endsAt}
                onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))}
              />
            </Stack>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleCreate} disabled={submitting || !form.content.trim()}>
            {submitting ? <CircularProgress size={18} /> : 'Post'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onClose={() => !deleting && setDeleteTarget(null)}>
        <DialogTitle>Delete Announcement?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">This announcement will be permanently removed.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? <CircularProgress size={18} /> : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProviderAnnouncementsPage;
