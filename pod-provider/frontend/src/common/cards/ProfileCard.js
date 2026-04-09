import React from 'react';
import { Box, Paper, Typography, Avatar, Button } from '@mui/material';
import { useGetIdentity, useLogout, useTranslate } from 'react-admin';
import { formatUsername } from '../../utils';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

const ProfileCard = () => {
  const { data: identity } = useGetIdentity();
  const logout = useLogout();
  const translate = useTranslate();

  if (!identity) return null;

  const joinedDate = identity.createdAt
    ? new Date(identity.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: '14px',
        border: '1px solid rgba(0,0,0,0.07)',
        backgroundColor: '#fff',
        overflow: 'hidden',
        mb: 2
      }}
    >
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
          <Avatar
            src={identity.avatar}
            alt={translate('app.accessibility.your_profile_picture')}
            sx={{ width: 40, height: 40, fontSize: 16 }}
          >
            {identity.fullName?.toUpperCase()[0]}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontWeight: 700,
                fontSize: 14,
                color: '#1a1a1a',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {identity.fullName}
            </Typography>
            {joinedDate && (
              <Typography sx={{ fontSize: 11, color: '#aaa', mt: 0.2 }}>
                Joined {joinedDate}
              </Typography>
            )}
          </Box>
        </Box>

        <Button
          fullWidth
          variant="contained"
          onClick={() => logout()}
          endIcon={<OpenInNewIcon sx={{ fontSize: '14px !important' }} />}
          sx={{
            backgroundColor: '#5B57E5',
            color: '#fff',
            borderRadius: 50,
            textTransform: 'none',
            fontWeight: 600,
            fontSize: 13,
            py: 0.75,
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#4a46d4', boxShadow: 'none' }
          }}
        >
          {translate('ra.auth.logout')}
        </Button>
      </Box>
    </Paper>
  );
};

export default ProfileCard;
