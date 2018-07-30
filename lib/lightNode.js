'use strict';

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var old = require('old');
var EventEmitter = require('events');
var RpcClient = require('./rpc.js');

var _require = require('./verify.js'),
    verifyCommit = _require.verifyCommit,
    verifyCommitSigs = _require.verifyCommitSigs,
    verifyValidatorSet = _require.verifyValidatorSet,
    verify = _require.verify;

var HOUR = 60 * 60 * 1000;
var FOUR_HOURS = 4 * HOUR;
var THIRTY_DAYS = 30 * 24 * HOUR;

// TODO: support multiple peers
// (multiple connections to listen for headers,
// get current height from multiple peers before syncing,
// randomly select peer when requesting data,
// broadcast txs to many peers)

// TODO: on error, disconnect from peer and try again

// TODO: use time heuristic to ensure nodes can't DoS by
// sending fake high heights.
// (applies to getting height when getting status in `sync()`,
// and when receiving a block in `update()`)

// talks to nodes via RPC and does light-client verification
// of block headers.

var LightNode = function (_EventEmitter) {
  _inherits(LightNode, _EventEmitter);

  function LightNode(peer, state) {
    var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};

    _classCallCheck(this, LightNode);

    var _this = _possibleConstructorReturn(this, (LightNode.__proto__ || Object.getPrototypeOf(LightNode)).call(this));

    _this.maxAge = opts.maxAge || THIRTY_DAYS;

    if (typeof state.header.height !== 'number') {
      throw Error('Expected state header to have a height');
    }

    // we should be able to trust this state since it was either
    // hardcoded into the client, or previously verified/stored,
    // but it doesn't hurt to do a sanity check. not required
    // for first block, since we might be deriving it from genesis
    if (state.header.height > 1 || state.commit != null) {
      verifyValidatorSet(state.validators, state.header.validators_hash);
      verifyCommit(state.header, state.commit, state.validators);
    }

    _this._state = state;

    _this.rpc = RpcClient(peer);
    _this.rpc.on('error', function (err) {
      return _this.emit('error', err);
    });
    _this.on('error', function () {
      return _this.rpc.close();
    });

    _this.handleError(_this.initialSync)().then(function () {
      return _this.emit('synced');
    });
    return _this;
  }

  _createClass(LightNode, [{
    key: 'handleError',
    value: function handleError(func) {
      var _this2 = this;

      return function () {
        for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
          args[_key] = arguments[_key];
        }

        return func.call.apply(func, [_this2].concat(args)).catch(function (err) {
          return _this2.emit('error', err);
        });
      };
    }
  }, {
    key: 'state',
    value: function state() {
      // TODO: deep clone
      return this._state;
    }
  }, {
    key: 'height',
    value: function height() {
      return this._state.header.height;
    }

    // sync from current state to latest block

  }, {
    key: 'initialSync',
    value: function () {
      var _ref = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee() {
        var status, tip;
        return regeneratorRuntime.wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                _context.next = 2;
                return this.rpc.status();

              case 2:
                status = _context.sent;
                tip = status.sync_info.latest_block_height;
                _context.next = 6;
                return this.syncTo(tip);

              case 6:
                this.handleError(this.subscribe)();

              case 7:
              case 'end':
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function initialSync() {
        return _ref.apply(this, arguments);
      }

      return initialSync;
    }()

    // binary search to find furthest block from our current state,
    // which is signed by 2/3+ voting power of our current validator set

  }, {
    key: 'syncTo',
    value: function () {
      var _ref2 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee2(nextHeight) {
        var targetHeight = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : nextHeight;

        var _ref3, SignedHeader, header, commit, height, midpoint;

        return regeneratorRuntime.wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                _context2.next = 2;
                return this.rpc.commit({ height: nextHeight });

              case 2:
                _ref3 = _context2.sent;
                SignedHeader = _ref3.SignedHeader;
                header = SignedHeader.header, commit = SignedHeader.commit;
                _context2.prev = 5;

                // test if this commit is signed by 2/3+ of our old set
                // (throws if not)
                verifyCommitSigs(header, commit, this._state.validators);

                // verifiable, let's update
                _context2.next = 9;
                return this.update(header, commit);

              case 9:
                if (!(nextHeight === targetHeight)) {
                  _context2.next = 11;
                  break;
                }

                return _context2.abrupt('return');

              case 11:
                return _context2.abrupt('return', this.syncTo(targetHeight));

              case 14:
                _context2.prev = 14;
                _context2.t0 = _context2['catch'](5);

                if (_context2.t0.insufficientVotingPower) {
                  _context2.next = 18;
                  break;
                }

                throw _context2.t0;

              case 18:

                // insufficient verifiable voting power,
                // couldn't verify this header

                height = this.height();

                if (!(nextHeight === height + 1)) {
                  _context2.next = 21;
                  break;
                }

                throw Error('Validator set changed too much to verify transition');

              case 21:

                // let's try going halfway back and see if we can verify
                midpoint = height + Math.ceil((nextHeight - height) / 2);
                return _context2.abrupt('return', this.syncTo(midpoint, targetHeight));

              case 23:
              case 'end':
                return _context2.stop();
            }
          }
        }, _callee2, this, [[5, 14]]);
      }));

      function syncTo(_x3) {
        return _ref2.apply(this, arguments);
      }

      return syncTo;
    }()

    // start verifying new blocks as they come in

  }, {
    key: 'subscribe',
    value: function () {
      var _ref4 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee4() {
        var _this3 = this;

        var query, syncing;
        return regeneratorRuntime.wrap(function _callee4$(_context4) {
          while (1) {
            switch (_context4.prev = _context4.next) {
              case 0:
                query = 'tm.event = \'NewBlockHeader\'';
                syncing = false;
                _context4.next = 4;
                return this.rpc.subscribe({ query: query }, this.handleError(function () {
                  var _ref6 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee3(_ref5) {
                    var header = _ref5.header;
                    return regeneratorRuntime.wrap(function _callee3$(_context3) {
                      while (1) {
                        switch (_context3.prev = _context3.next) {
                          case 0:
                            if (!syncing) {
                              _context3.next = 2;
                              break;
                            }

                            return _context3.abrupt('return');

                          case 2:
                            syncing = true;
                            _context3.next = 5;
                            return _this3.syncTo(header.height);

                          case 5:
                            syncing = false;

                          case 6:
                          case 'end':
                            return _context3.stop();
                        }
                      }
                    }, _callee3, _this3);
                  }));

                  return function (_x4) {
                    return _ref6.apply(this, arguments);
                  };
                }()));

              case 4:
              case 'end':
                return _context4.stop();
            }
          }
        }, _callee4, this);
      }));

      function subscribe() {
        return _ref4.apply(this, arguments);
      }

      return subscribe;
    }()
  }, {
    key: 'update',
    value: function () {
      var _ref7 = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee5(header, commit) {
        var height, prevTime, nextTime, res, validators, validatorSetChanged, _res, newState;

        return regeneratorRuntime.wrap(function _callee5$(_context5) {
          while (1) {
            switch (_context5.prev = _context5.next) {
              case 0:
                height = header.height;

                if (height) {
                  _context5.next = 3;
                  break;
                }

                throw Error('Expected header to have height');

              case 3:

                // make sure we aren't syncing from longer than than the unbonding period
                prevTime = new Date(this._state.header.time).getTime();

                if (!(Date.now() - prevTime > this.maxAge)) {
                  _context5.next = 6;
                  break;
                }

                throw Error('Our state is too old, cannot update safely');

              case 6:

                // make sure new commit isn't too far in the future
                nextTime = new Date(header.time).getTime();

                if (!(nextTime - Date.now() > FOUR_HOURS)) {
                  _context5.next = 9;
                  break;
                }

                throw Error('Header time is too far in the future');

              case 9:
                if (!(commit == null)) {
                  _context5.next = 14;
                  break;
                }

                _context5.next = 12;
                return this.rpc.commit({ height: height });

              case 12:
                res = _context5.sent;

                commit = res.SignedHeader.commit;

              case 14:
                validators = this._state.validators;
                validatorSetChanged = header.validators_hash !== this._state.header.validators_hash;

                if (!validatorSetChanged) {
                  _context5.next = 21;
                  break;
                }

                _context5.next = 19;
                return this.rpc.validators({ height: height });

              case 19:
                _res = _context5.sent;

                validators = _res.validators;

              case 21:
                newState = { header: header, commit: commit, validators: validators };

                verify(this._state, newState);

                this._state = newState;
                this.emit('update', header, commit, validators);

              case 25:
              case 'end':
                return _context5.stop();
            }
          }
        }, _callee5, this);
      }));

      function update(_x5, _x6) {
        return _ref7.apply(this, arguments);
      }

      return update;
    }()
  }]);

  return LightNode;
}(EventEmitter);

module.exports = old(LightNode);