/* global exports, require */

var _ = require('ep_etherpad-lite/static/js/underscore');
var db = require('ep_etherpad-lite/node/db/DB');
var randomString = require('ep_etherpad-lite/static/js/pad_utils').randomString;
var readOnlyManager = require("ep_etherpad-lite/node/db/ReadOnlyManager.js");
var shared = require('./static/js/shared');

exports.getComments = async (padId) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  // Not sure if we will encouter race conditions here..  Be careful.

  // get the globalComments
  let comments = await db.get('comments:' + padId);
  if (comments == null) comments = {};
  return {comments};
};

exports.deleteComment = async (padId, commentId) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  let comments = await db.get('comments:' + padId);
  // the entry doesn't exist so far, let's create it
  if (comments == null) comments = {};
  delete comments[commentId];
  await db.set('comments:' + padId, comments);

  return padIds;
};

exports.deleteComments = async (padId) => {
  await db.remove('comments:' + padId);
};

exports.addComment = async (padId, data) => {
  const [padIds, commentIds, comments] = await exports.bulkAddComments(padId, [data]);
  return [padIds, commentIds[0], comments[0]];
};

exports.bulkAddComments = async (padId, data) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  // get the entry
  let comments = await db.get('comments:' + padId);

  // the entry doesn't exist so far, let's create it
  if (comments == null) comments = {};

  const newComments = [];
  const commentIds = data.map((commentData) => {
    // if the comment was copied it already has a commentID, so we don't need create one
    const commentId = commentData.commentId || shared.generateCommentId();

    const comment = {
      author: commentData.author || 'empty',
      name: commentData.name,
      text: commentData.text,
      changeTo: commentData.changeTo,
      changeFrom: commentData.changeFrom,
      timestamp: parseInt(commentData.timestamp) || new Date().getTime(),
    };
    // add the entry for this pad
    comments[commentId] = comment;

    newComments.push(comment);
    return commentId;
  });

  // save the new element back
  await db.set('comments:' + padId, comments);

  return [padIds, commentIds, newComments];
};

exports.copyComments = async (originalPadId, newPadID) => {
  // get the comments of original pad
  const originalComments = await db.get('comments:' + originalPadId);
  // make sure we have different copies of the comment between pads
  const copiedComments = _.mapObject(originalComments, (thisComment) => _.clone(thisComment));

  // save the comments on new pad
  await db.set('comments:' + newPadID, copiedComments);
};

exports.getCommentReplies = async (padId) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  // get the globalComments replies
  let replies = await db.get('comment-replies:' + padId);
  // comment does not exist
  if (replies == null) replies = {};
  return {replies};
};

exports.deleteCommentReplies = async (padId) => {
  await db.remove('comment-replies:' + padId);
};

exports.addCommentReply = async (padId, data) => {
  const [padIds, replyIds, replies] = await exports.bulkAddCommentReplies(padId, [data]);
  return [padIds, replyIds[0], replies[0]];
};

exports.bulkAddCommentReplies = async (padId, data) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  // get the entry
  let replies = await db.get('comment-replies:' + padId);
  // the entry doesn't exist so far, let's create it
  if (replies == null) replies = {};

  const newReplies = [];
  const replyIds = _.map(data, (replyData) => {
    // create the new reply id
    const replyId = "c-reply-" + randomString(16);

    const metadata = replyData.comment || {};

    const reply = {
      commentId: replyData.commentId,
      text: replyData.reply || replyData.text,
      changeTo: replyData.changeTo || null,
      changeFrom: replyData.changeFrom || null,
      author: metadata.author || 'empty',
      name: metadata.name || replyData.name,
      timestamp: parseInt(replyData.timestamp) || new Date().getTime()
    };

    // add the entry for this pad
    replies[replyId] = reply;

    newReplies.push(reply);
    return replyId;
  });

  // save the new element back
  await db.set('comment-replies:' + padId, replies);

  return [padIds, replyIds, newReplies];
};

exports.copyCommentReplies = async (originalPadId, newPadID) => {
  // get the replies of original pad
  const originalReplies = await db.get('comment-replies:' + originalPadId);
  // make sure we have different copies of the reply between pads
  const copiedReplies = _.mapObject(originalReplies, (thisReply) => _.clone(thisReply));

  // save the comment replies on new pad
  await db.set('comment-replies:' + newPadID, copiedReplies);
};

exports.changeAcceptedState = async (padId, commentId, state) => {
  // Given a comment we update that comment to say the change was accepted or reverted

  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  // If we're dealing with comment replies we need to a different query
  var prefix = "comments:";
  if(commentId.substring(0,7) === "c-reply"){
    prefix = "comment-replies:";
  }

  // get the entry
  const comments = await db.get(prefix + padId);

  // add the entry for this pad
  const comment = comments[commentId];

  if (state) {
    comment.changeAccepted = true;
    comment.changeReverted = false;
  } else {
    comment.changeAccepted = false;
    comment.changeReverted = true;
  }

  comments[commentId] = comment;

  //save the new element back
  await db.set(prefix + padId, comments);

  return padIds;
};

exports.changeCommentText = async (padId, commentId, commentText) => {
  // We might need to change readOnly PadIds to Normal PadIds
  var padIds = await readOnlyManager.getIds(padId);
  padId = padIds.padId;

  if (commentText.length <= 0) return [padIds, true];

  // Given a comment we update the comment text

  // If we're dealing with comment replies we need to a different query
  var prefix = 'comments:';
  if (commentId.substring(0,7) === 'c-reply') {
    prefix = 'comment-replies:';
  }

  // get the entry
  const comments = await db.get(prefix + padId);

  // update the comment text
  comments[commentId].text = commentText;

  // save the comment updated back
  await db.set(prefix + padId, comments);

  return [padIds, null];
};
