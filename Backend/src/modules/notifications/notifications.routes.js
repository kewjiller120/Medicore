'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const ctrl = require('./notifications.controller');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/authenticate');

const router = express.Router();

router.use(authenticate); // every logged-in user has a notification feed

router.get('/', [query('unread').optional().isBoolean(), query('limit').optional().isInt({ min: 1, max: 200 })], validate, ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', [param('id').isInt()], validate, ctrl.markRead);

module.exports = router;