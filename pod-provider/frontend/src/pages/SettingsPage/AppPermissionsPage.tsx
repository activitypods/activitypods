import DeleteIcon from '@mui/icons-material/Delete';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type AppConsent = {
  '@id': string;
  clientId: string;
  permissions: string | string[];
};

function normalizePermissions(p: string | string[] | undefined): string[] {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  return p
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const AppPermissionsPage = () => {
  const [consents, setConsents] = useState<AppConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [permissionsRaw, setPermissionsRaw] = useState('');

  const loadConsents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await dashboardApi.listAppConsents();
      setConsents(res.data || []);
    } catch (e: any) {
      setError(e.message || 'Failed to load consents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConsents();
  }, []);

  const handleGrant = async () => {
    if (clientId.trim().length === 0) return;
    const perms = permissionsRaw
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    setSaving(true);
    try {
      await dashboardApi.createAppConsent({ clientId: clientId.trim(), permissions: perms });
      setClientId('');
      setPermissionsRaw('');
      await loadConsents();
    } catch (e: any) {
      setError(e.message || 'Failed to grant access');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (uri: string) => {
    try {
      await dashboardApi.remove(uri);
      await loadConsents();
    } catch (e: any) {
      setError(e.message || 'Failed to revoke');
    }
  };

  return (
    <Box p={3}>
      <Typography variant="h5" gutterBottom>
        App Permissions
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Apps you have granted access to your Pod. Revoking removes their stored consent.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && <CircularProgress size={20} />}

      {loading === false && consents.length === 0 && (
        <Typography variant="body2" color="text.secondary" mb={2}>
          No app permissions granted yet.
        </Typography>
      )}

      <List disablePadding>
        {consents.map((consent) => {
          const uri = consent['@id'];
          const scopes = normalizePermissions(consent.permissions);
          return (
            <ListItem key={uri} divider alignItems="flex-start">
              <ListItemText
                primary={
                  <Typography variant="body1" fontWeight={500}>
                    {consent.clientId}
                  </Typography>
                }
                secondary={
                  <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
                    {scopes.length > 0 ? (
                      scopes.map((scope) => (
                        <Chip key={scope} label={scope} variant="outlined" size="small" />
                      ))
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No specific scopes recorded
                      </Typography>
                    )}
                  </Stack>
                }
              />
              <ListItemSecondaryAction>
                <IconButton
                  edge="end"
                  size="small"
                  sx={{ color: 'error.main' }}
                  onClick={() => handleRevoke(uri)}
                  aria-label="revoke access"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </ListItemSecondaryAction>
            </ListItem>
          );
        })}
      </List>

      <Box mt={3} p={2} bgcolor="action.hover" borderRadius={1}>
        <Typography variant="subtitle2" gutterBottom>
          Grant access to an app
        </Typography>
        <Stack spacing={1.5}>
          <TextField
            size="small"
            label="App / client ID"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            fullWidth
          />
          <TextField
            size="small"
            label="Scopes (comma-separated)"
            helperText="e.g. read:moderation, read:curation"
            value={permissionsRaw}
            onChange={(e) => setPermissionsRaw(e.target.value)}
            fullWidth
          />
          <Button
            variant="contained"
            disabled={clientId.trim().length === 0 || saving}
            onClick={handleGrant}
            sx={{ alignSelf: 'flex-start' }}
          >
            Grant access
          </Button>
        </Stack>
      </Box>
    </Box>
  );
};

export default AppPermissionsPage;
