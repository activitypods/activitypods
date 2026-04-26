import React, { useState } from 'react';
import { Box, Paper, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import { useTranslate } from 'react-admin';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import useContactLink from '../../hooks/useContactLink';

const ShareContactCard = () => {
  const translate = useTranslate();
  const { contactLink, status } = useContactLink();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      <Box sx={{ px: 2.5, pt: 2, pb: 2 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 13, color: '#1a1a1a', mb: 1.5 }}>My contact link</Typography>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            backgroundColor: '#f7f5f2',
            borderRadius: '8px',
            px: 1.5,
            py: 0.75,
            border: '1px solid rgba(0,0,0,0.07)'
          }}
        >
          <Typography
            sx={{
              fontSize: 11,
              color: '#666',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            {status === 'loading' ? (
              <CircularProgress size={12} sx={{ mr: 0.5 }} />
            ) : status === 'error' ? (
              translate('app.message.loading_invite_link_failed')
            ) : (
              contactLink || '—'
            )}
          </Typography>
          <Tooltip title={copied ? translate('app.message.copied_to_clipboard') : translate('app.action.copy')}>
            <span>
              <CopyToClipboard text={contactLink || ''} onCopy={handleCopy}>
                <IconButton
                  size="small"
                  disabled={status !== 'loaded'}
                  aria-label={translate('app.accessibility.copy_invitation_link_button')}
                  sx={{
                    color: copied ? '#5B57E5' : '#999',
                    flexShrink: 0,
                    '&:hover': { color: '#5B57E5', backgroundColor: 'transparent' }
                  }}
                >
                  {copied ? <CheckIcon sx={{ fontSize: 16 }} /> : <ContentCopyIcon sx={{ fontSize: 16 }} />}
                </IconButton>
              </CopyToClipboard>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Paper>
  );
};

export default ShareContactCard;
