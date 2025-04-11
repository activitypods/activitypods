import React, { useState } from 'react';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'reac... Remove this comment to see the full error message
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { IconButton, Tooltip } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import FileCopyOutlinedIcon from '@mui/icons-material/FileCopyOutlined';
import { useTranslate } from 'react-admin';

const useStyles = makeStyles(() => ({
  icon: {
    position: 'absolute',
    top: -2,
    left: 5
  }
}));

const CopyButton = ({ text, className }: any) => {
  const [copied, setCopied] = useState(false);
  const classes = useStyles();
  const translate = useTranslate();
  return (
    // @ts-expect-error TS(2339): Property 'wrapper' does not exist on type 'ClassNa... Remove this comment to see the full error message
    <span className={classes.wrapper}>
      <CopyToClipboard text={text} onCopy={() => setCopied(true)}>
        <Tooltip title={translate(copied ? 'app.message.copied_to_clipboard' : 'app.action.copy')} placement="top">
          <IconButton size="small" className={className}>
            <FileCopyOutlinedIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
      </CopyToClipboard>
    </span>
  );
};

export default CopyButton;
