// Adopted from https://github.com/marmelab/react-admin/blob/master/examples/crm/src/contacts/TagsListEdit.tsx
import React, { useState } from 'react';
import { useCreate, useUpdate, useGetList, Identifier, useRecordContext } from 'react-admin';

import {
  Chip,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Menu,
} from '@material-ui/core';
import ControlPointIcon from '@material-ui/icons/ControlPoint';
import EditIcon from '@material-ui/icons/Edit';
import { arrayFromLdField, colorFromString } from '../../utils';

const colors = ['lightblue', 'lightgreen', 'lightpink', 'lightyellow', 'lightgrey'];

/**
 * @typedef {import('react').MouseEvent<HTMLDivElement>} ReactDivMouseEvent
 * @typedef {import('react').ChangeEvent<HTMLInputElement>} ReactInputChangeEvent
 * @typedef {import('react').FormEvent<HTMLFormElement>} ReactFormEvent
 */

/**
 * @returns {JSX.Element | null}
 */
export const TagsListEdit = () => {
  const record = useRecordContext();
  const entityId = record['id'];
  const relationshipPredicate = 'vcard:hasMember';
  const namePredicate = 'vcard:label';
  const colorPredicate = undefined;
  const avatarPredicate = 'vcard:photo';
  const idPredicate = 'id';
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(colors[0]);
  const [anchorEl, setAnchorEl] = useState(null);
  const [disabled, setDisabled] = useState(false);

  // TODO: Somehow adding / removing tags, removes all of them in the frontend until reload.

  const { data: tagRelationshipData, isLoading: isLoadingAllTags } = useGetList('Group');

  // Next, we convert tagRelationshipData into a common tag format.
  const tags = Object.values(tagRelationshipData).map((tagData) => ({
    id: tagData[idPredicate],
    name: tagData[namePredicate],
    // The color or a color generated from the name.
    color: tagData[colorPredicate] || colorFromString(tagData[namePredicate]),
    avatar: tagData[avatarPredicate],
    owners: arrayFromLdField(tagData[relationshipPredicate]),
  }));

  const selectedTags = tags.filter((tag) => tag.owners.includes(entityId));
  const unselectedTags = tags.filter((tag) => !tag.owners.includes(entityId));

  const [update] = useUpdate();
  //  const [create] = useCreate();

  /**
   * @param {ReactDivMouseEvent} event
   */
  const handleOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  /**
   * @param {Identifier} id
   */
  const handleDeleteTag = (id) => {
    const memberIds = tags.find((tag) => tag.id === id).owners.filter((memberId) => memberId !== entityId);
    update('Group', id, {
      ...tagRelationshipData[id],
      [relationshipPredicate]: memberIds,
      'dc:modified': new Date().toISOString(),
    });
  };

  /**
   * @param {Identifier} id
   */
  const handleAddTag = (id) => {
    const memberIds = [...tags.find((tag) => tag.id === id).owners, entityId];
    update('Group', id, {
      ...tagRelationshipData[id],
      [relationshipPredicate]: memberIds,
      'dc:modified': new Date().toISOString(),
    });
    setAnchorEl(null);
  };

  const handleOpenCreateDialog = () => {
    setOpen(true);
    setAnchorEl(null);
    setDisabled(false);
  };

  /**
   * @param {ReactInputChangeEvent} event
   */
  const handleNewTagNameChange = (event) => {
    setNewTagName(event.target.value);
  };

  /**
   * @param {ReactFormEvent} event
   */
  const handleCreateTag = (event) => {
    event.preventDefault();
    setDisabled(true);
    /*
    create(
      'Group',
      { data: { name: newTagName, color: newTagColor } },
      {
        onSuccess: (tag) => {
          update(
            'contacts',
            {
              id: record.id,
              data: { tags: [...record.tags, tag.id] },
              previousData: record,
            },
            {
              onSuccess: () => {
                setNewTagName('');
                setNewTagColor(colors[0]);
                setOpen(false);
              },
            }
          );
        },
      }
    );
    */
  };

  if (isLoadingAllTags) return null;
  return (
    <>
      {selectedTags.map((tag) => (
        <Box mt={1} mb={1} key={tag.id}>
          <Chip
            size="small"
            variant="outlined"
            onDelete={() => handleDeleteTag(tag.id)}
            label={tag.name}
            style={{ backgroundColor: tag.color, border: 0 }}
          />
        </Box>
      ))}
      <Box mt={1}>
        <Chip
          icon={<ControlPointIcon />}
          size="small"
          variant="outlined"
          onClick={handleOpen}
          label="Add tag"
          color="primary"
        />
      </Box>
      <Menu open={Boolean(anchorEl)} onClose={handleClose} anchorEl={anchorEl}>
        {unselectedTags?.map((tag) => (
          <MenuItem key={tag.id} onClick={() => handleAddTag(tag.id)}>
            <Chip
              size="small"
              variant="outlined"
              label={tag.name}
              style={{
                backgroundColor: tag.color,
                border: 0,
              }}
              onClick={() => handleAddTag(tag.id)}
            />
          </MenuItem>
        ))}
        <MenuItem onClick={handleOpenCreateDialog}>
          <Chip
            icon={<EditIcon />}
            size="small"
            variant="outlined"
            onClick={handleOpenCreateDialog}
            color="primary"
            label="Create new tag"
          />
        </MenuItem>
      </Menu>
      <Dialog open={open} onClose={() => setOpen(false)} aria-labelledby="form-dialog-title">
        <form onSubmit={handleCreateTag}>
          <DialogTitle id="form-dialog-title">Create a new tag</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              label="Tag name"
              fullWidth
              value={newTagName}
              onChange={handleNewTagNameChange}
              sx={{ mt: 1 }}
            />
            <Box display="flex" flexWrap="wrap" width={230} mt={2}>
              {colors.map((color) => (
                <RoundButton
                  key={color}
                  color={color}
                  selected={color === newTagColor}
                  handleClick={() => {
                    setNewTagColor(color);
                  }}
                />
              ))}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpen(false)} color="primary">
              Cancel
            </Button>
            <Button type="submit" color="primary" disabled={disabled}>
              Add tag
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
};

/**
 * @param {RoundButtonProps} props
 * @returns {JSX.Element}
 */
const RoundButton = (props) => (
  <Box
    component="button"
    type="button"
    sx={{
      bgcolor: props.color,
      width: 30,
      height: 30,
      borderRadius: 15,
      border: props.selected ? '2px solid grey' : 'none',
      display: 'inline-block',
      margin: 1,
    }}
    onClick={props.handleClick}
  />
);
