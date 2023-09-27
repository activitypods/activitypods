import React, { useState } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { IconButton, makeStyles, Tooltip } from '@material-ui/core';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import { useTranslate } from 'react-admin';

const useStyles = makeStyles(theme => ({
  wrapper: {
    // position: 'relative',
  },
  icon: {
    position: 'absolute',
    top: -2,
    left: 5
  }
}));

const CopyButton = ({ text, className }) => {
  const [copied, setCopied] = useState(false);
  const classes = useStyles();
  const translate = useTranslate();
  return (
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
