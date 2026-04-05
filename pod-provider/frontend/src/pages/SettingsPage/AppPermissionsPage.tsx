import DeleteIcon from '@mui/icons-material/Delete';
import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { dashboardApi } from './dashboardApi';

type LdpResource = { '@id': string };

type ConsentScope = 'read:moderation' | 'write:moderation' | 'app:overrides' | 'read:trust' | string;

type AppConsent = LdpResource & {
  clientId: string;
  permissions: ConsentScope[];
  createdAt?: string;
  updatedAt?: string;
};

type ScopeColor = 'default' | 'primary' | 'warning';

const SCOPE_META: Record<string, { label: string; description: string; color: ScopeColor }> = {
  'read:moderation': {
    label: 'Read moderation',
    description: 'Can read your filters, mutes, and blocks',
    color: 'default'
  },
  'write:moderation': {
    label: 'Write moderation',
    description: 'Can add, modify, or remove your filters, mutes, and blocks',
    color: 'warning'
  },
  'app:overrides': {
    label: 'App-local overrides',
    description: 'Can store per-app settings that do not affect shared pod policy',
    color: 'primary'
  },
  'read:trust': {
    label: 'Read trust sources',
    description: 'Can read your trusted moderation packs and external lists',
    color: 'default'
  }
};

const KNOWN_SCOPES: ConsentScope[] = ['read:moderation', 'write:moderation', 'app:overrides', 'read:trust'];

function normalizePermissions(p: string | string[] | undefined): ConsentScope[] {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  return p
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

const AppPermissionsPage = () => {
  const [consents, setConsents] = useState<AppConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<Set<ConsentScope>>(new Set());

  const loadConsents = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    loadConsents();
  }, [loadConsents]);

  const toggleScope = (scope: ConsentScope) => {
    setSelectedScopes(prev => {
      const next = new Set(prev);
      if (next.has(scope)) {
        next.delete(scope);
      } else {
        next.add(scope);
      }
      return next;
    });
  };

  const handleGrant = async () => {
    if (clientId.trim().length === 0 || selectedScopes.size === 0) return;
    setSaving(true);
    try {
      await dashboardApi.createAppConsent({
        clientId: clientId.trim(),
        permissions: Array.from(selectedScopes)
      });
      setClientId('');
      setSelectedScopes(new Set());
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
        Apps you have granted access to your Pod. Each scope is explicit — revoking removes the consent record entirely.
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
        {consents.map(consent => {
          const uri = consent['@id'];
          const scopes = normalizePermissions(consent.permissions);
          return (
            <ListItem key={uri} divider alignItems="flex-start" sx={{ py: 1.5 }}>
              <ListItemText
                primary={
                  <Typography variant="body1" fontWeight={500}>
                    {consent.clientId}
                  </Typography>
                }
                secondary={
                  <Stack direction="row" flexWrap="wrap" gap={0.5} mt={0.5}>
                    {scopes.length > 0 ? (
                      scopes.map(scope => {
                        const meta = SCOPE_META[scope];
                        return meta ? (
                          <Tooltip key={scope} title={meta.description} arrow>
                            <Chip label={meta.label} color={meta.color as ScopeColor} variant="outlined" size="small" />
                          </Tooltip>
                        ) : (
                          <Chip key={scope} label={scope} variant="outlined" size="small" />
                        );
                      })
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        No specific scopes recorded
                      </Typography>
                    )}
                  </Stack>
                }
              />
              <ListItemSecondaryAction>
                <Tooltip title="Revoke access">
                  <IconButton
                    edge="end"
                    size="small"
                    sx={{ color: 'error.main' }}
                    onClick={() => handleRevoke(uri)}
                    aria-label="revoke access"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </ListItemSecondaryAction>
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ my: 3 }} />

      <Box>
        <Typography variant="subtitle1" fontWeight={500} gutterBottom>
          Grant access to an app
        </Typography>
        <Stack spacing={2}>
          <TextField
            size="small"
            label="App / client ID"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            fullWidth
          />
          <Box>
            <Typography variant="body2" color="text.secondary" mb={1}>
              Scopes to grant
            </Typography>
            <FormGroup>
              {KNOWN_SCOPES.map(scope => {
                const meta = SCOPE_META[scope]!;
                return (
                  <FormControlLabel
                    key={scope}
                    control={
                      <Checkbox
                        size="small"
                        checked={selectedScopes.has(scope)}
                        onChange={() => toggleScope(scope)}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">{meta.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {meta.description}
                        </Typography>
                      </Box>
                    }
                  />
                );
              })}
            </FormGroup>
          </Box>
          <Button
            variant="contained"
            disabled={clientId.trim().length === 0 || selectedScopes.size === 0 || saving}
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
