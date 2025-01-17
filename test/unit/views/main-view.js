'use strict';

var MainView = require('../../../src/views/main-view');
var ApplePayView = require('../../../src/views/payment-sheet-views/apple-pay-view');
var BaseView = require('../../../src/views/base-view');
var BasePayPalView = require('../../../src/views/payment-sheet-views/base-paypal-view');
var CardView = require('../../../src/views/payment-sheet-views/card-view');
var GooglePayView = require('../../../src/views/payment-sheet-views/google-pay-view');
var PaymentMethodsView = require('../../../src/views/payment-methods-view');
var Promise = require('../../../src/lib/promise');
var analytics = require('../../../src/lib/analytics');
var classList = require('@braintree/class-list');
var fake = require('../../helpers/fake');
var fs = require('fs');
var hostedFields = require('braintree-web/hosted-fields');
var PaymentOptionsView = require('../../../src/views/payment-options-view');
var PayPalView = require('../../../src/views/payment-sheet-views/paypal-view');
var PayPalCheckout = require('braintree-web/paypal-checkout');
var sheetViews = require('../../../src/views/payment-sheet-views');
var strings = require('../../../src/translations/en_US');

var templateHTML = fs.readFileSync(__dirname + '/../../../src/html/main.html', 'utf8');
var CHANGE_ACTIVE_PAYMENT_METHOD_TIMEOUT = require('../../../src/constants').CHANGE_ACTIVE_PAYMENT_METHOD_TIMEOUT;

describe('MainView', function () {
  beforeEach(function () {
    this.client = fake.client();
    this.sandbox.stub(CardView.prototype, 'getPaymentMethod');
    this.sandbox.stub(BasePayPalView.prototype, 'initialize');
    this.sandbox.stub(analytics, 'sendEvent');
  });

  describe('Constructor', function () {
    beforeEach(function () {
      this.sandbox.stub(MainView.prototype, '_initialize');
    });

    it('calls _initialize', function () {
      new MainView(); // eslint-disable-line no-new

      expect(MainView.prototype._initialize).to.have.been.calledOnce;
    });

    it('inherits from BaseView', function () {
      expect(new MainView()).to.be.an.instanceof(BaseView);
    });
  });

  describe('initialize', function () {
    beforeEach(function () {
      var element = document.createElement('div');

      element.innerHTML = templateHTML;

      this.mainViewOptions = {
        client: this.client,
        element: element,
        merchantConfiguration: {
          authorization: fake.tokenizationKey
        },
        strings: strings
      };
    });

    afterEach(function () {
      document.body.innerHTML = '';
    });

    it('creates a CardView if it is the only payment option', function () {
      var mainView;
      var model = fake.model();

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];

        this.mainViewOptions.model = model;

        mainView = new MainView(this.mainViewOptions);

        expect(Object.keys(mainView._views)).to.contain(CardView.ID);
        expect(mainView.primaryView.ID).to.equal(CardView.ID);
      }.bind(this));
    });

    it('creates a PaymentOptionsView if there are multiple payment options', function () {
      var model, mainView;
      var modelOptions = fake.modelOptions();

      modelOptions.paymentMethods = [{foo: 'bar'}, {baz: 'qux'}];
      model = fake.model(modelOptions);

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card', 'paypal'];

        this.mainViewOptions.model = model;

        this.sandbox.stub(PayPalCheckout, 'create').yields(null, {});

        mainView = new MainView(this.mainViewOptions);

        expect(Object.keys(mainView._views)).to.contain(PaymentOptionsView.ID);
      }.bind(this));
    });

    it('listens for enableEditMode', function () {
      var mainView;
      var model = fake.model();

      return model.initialize().then(function () {
        this.sandbox.stub(model, 'on');
        model.supportedPaymentOptions = ['card'];

        this.mainViewOptions.model = model;

        mainView = new MainView(this.mainViewOptions);

        expect(mainView.model.on).to.be.calledWith('enableEditMode', this.sandbox.match.func);
      }.bind(this));
    });

    it('listens for disableEditMode', function () {
      var mainView;
      var model = fake.model();

      return model.initialize().then(function () {
        this.sandbox.stub(model, 'on');
        model.supportedPaymentOptions = ['card'];

        this.mainViewOptions.model = model;

        mainView = new MainView(this.mainViewOptions);

        expect(mainView.model.on).to.be.calledWith('disableEditMode', this.sandbox.match.func);
      }.bind(this));
    });

    it('listens for confirmPaymentMethodDeletion', function () {
      var mainView;
      var model = fake.model();

      return model.initialize().then(function () {
        this.sandbox.stub(model, 'on');
        model.supportedPaymentOptions = ['card'];

        this.mainViewOptions.model = model;

        mainView = new MainView(this.mainViewOptions);

        expect(mainView.model.on).to.be.calledWith('confirmPaymentMethodDeletion', this.sandbox.match.func);
      }.bind(this));
    });

    context('with vaulted payment methods', function () {
      beforeEach(function () {
        var element = document.createElement('div');

        element.innerHTML = templateHTML;

        this.model = fake.model();

        this.model.getVaultedPaymentMethods.resolves([
          {type: 'CreditCard', details: {lastTwo: '11'}},
          {type: 'PayPalAccount', details: {email: 'me@example.com'}}
        ]);

        this.dropinOptions = {
          client: this.client,
          merchantConfiguration: {
            container: '#foo',
            authorization: fake.tokenizationKey
          }
        };

        return this.model.initialize().then(function () {
          this.model.supportedPaymentOptions = ['card', 'paypal'];

          this.mainViewOptions = {
            client: this.client,
            element: element,
            merchantConfiguration: {
              authorization: fake.tokenizationKey
            },
            model: this.model,
            strings: strings
          };

          this.sandbox.stub(PayPalCheckout, 'create').yields(null, {});
        }.bind(this));
      });

      it('sets the first payment method to be the active payment method', function () {
        this.sandbox.spy(this.model, 'changeActivePaymentMethod');

        new MainView(this.mainViewOptions); // eslint-disable-line no-new

        expect(this.model.changeActivePaymentMethod).to.have.been.calledWith({type: 'CreditCard', details: {lastTwo: '11'}});
      });

      it('does not set the first payment method to be the active payment method if configured not to', function () {
        this.sandbox.spy(this.model, 'changeActivePaymentMethod');
        this.model.merchantConfiguration.preselectVaultedPaymentMethod = false;
        this.sandbox.stub(MainView.prototype, 'setPrimaryView');

        new MainView(this.mainViewOptions); // eslint-disable-line no-new

        expect(this.model.changeActivePaymentMethod).to.not.have.been.called;
        expect(MainView.prototype.setPrimaryView).to.be.calledOnce;
        expect(MainView.prototype.setPrimaryView).to.be.calledWith('methods');
      });

      it('sends preselect analytic event when a vaulted card is preselected', function () {
        this.model.merchantConfiguration.preselectVaultedPaymentMethod = true;
        new MainView(this.mainViewOptions); // eslint-disable-line no-new

        expect(analytics.sendEvent).to.be.calledWith(this.client, 'vaulted-card.preselect');
      });

      it('does not send preselect analytic event when a vaulted card is not preselected', function () {
        this.model.merchantConfiguration.preselectVaultedPaymentMethod = false;

        new MainView(this.mainViewOptions); // eslint-disable-line no-new

        expect(analytics.sendEvent).to.not.be.calledWith(this.client, 'vaulted-card.preselect');
      });

      it('sets the PaymentMethodsView as the primary view', function (done) {
        var mainView = new MainView(this.mainViewOptions);

        setTimeout(function () {
          expect(mainView.primaryView.ID).to.equal(PaymentMethodsView.ID);
          done();
        }, CHANGE_ACTIVE_PAYMENT_METHOD_TIMEOUT);
      });
    });

    describe('without vaulted payment methods', function () {
      beforeEach(function () {
        var element = document.createElement('div');

        element.innerHTML = templateHTML;

        this.model = fake.model();

        return this.model.initialize().then(function () {
          this.mainViewOptions = {
            client: this.client,
            element: element,
            merchantConfiguration: {
              authorization: fake.tokenizationKey
            },
            model: this.model,
            strings: strings
          };

          this.sandbox.stub(PayPalCheckout, 'create').yields(null, {});
        }.bind(this));
      });

      it('sets PaymentOptionsViews as the primary view if there are multiple payment methods', function () {
        var mainView;

        this.model.supportedPaymentOptions = ['card', 'paypal'];

        mainView = new MainView(this.mainViewOptions);

        expect(mainView.primaryView.ID).to.equal(PaymentOptionsView.ID);
      });

      it('sets the sheet view as the primary view if there is one payment method', function () {
        var mainView;

        this.model.supportedPaymentOptions = ['card'];

        mainView = new MainView(this.mainViewOptions);

        expect(mainView.primaryView.ID).to.equal(CardView.ID);
      });
    });
  });

  describe('addView', function () {
    beforeEach(function () {
      this.fakeView = {
        element: document.createElement('span'),
        ID: 'fake-id'
      };

      this.context = {
        element: document.createElement('div'),
        _views: []
      };
    });

    it('adds the argument to the array of views', function () {
      MainView.prototype.addView.call(this.context, this.fakeView);

      expect(this.context._views[this.fakeView.ID]).to.equal(this.fakeView);
    });
  });

  describe('setPrimaryView', function () {
    beforeEach(function () {
      var model = fake.model();
      var wrapper = document.createElement('div');

      wrapper.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card', 'paypal', 'paypalCredit', 'applePay', 'googlePay', 'venmo'];

        this.mainViewOptions = {
          element: wrapper,
          model: model,
          client: this.client,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          strings: strings
        };

        this.sandbox.stub(PayPalCheckout, 'create').yields(null, {});
      }.bind(this));
    });

    it('clears any errors', function () {
      var mainView = new MainView(this.mainViewOptions);

      this.sandbox.stub(mainView.model, 'clearError');

      mainView.setPrimaryView(CardView.ID);

      expect(mainView.model.clearError).to.have.been.calledOnce;
    });

    [
      ApplePayView,
      CardView,
      PaymentMethodsView,
      PaymentOptionsView,
      PayPalView,
      GooglePayView
    ].forEach(function (View) {
      describe('when given a ' + View.ID + 'view', function () {
        beforeEach(function () {
          this.sandbox.useFakeTimers();
        });

        it('shows the selected view by updating the classname of the drop-in wrapper', function () {
          var mainView = new MainView(this.mainViewOptions);

          mainView.setPrimaryView(View.ID);
          this.sandbox.clock.tick(1);
          expect(mainView.element.className).to.equal('braintree-show-' + View.ID);
        });
      });

      it('sets the view as the primary view', function () {
        var mainView = new MainView(this.mainViewOptions);

        mainView.setPrimaryView(View.ID);

        expect(mainView.primaryView).to.equal(mainView.getView(View.ID));
      });

      it('changes the active payment option', function () {
        var mainView = new MainView(this.mainViewOptions);

        mainView.setPrimaryView(View.ID);

        expect(mainView.model.getActivePaymentView()).to.equal(View.ID);
      });
    });

    it('applies no-flexbox data attribute when flexbox is not supported', function () {
      var mainView = new MainView(this.mainViewOptions);
      var wrapper = mainView.element;

      mainView.supportsFlexbox = false;

      mainView.setPrimaryView(CardView.ID);

      expect(wrapper.dataset.braintreeNoFlexbox).to.equal('true');
    });

    it('does not apply no-flexbox data attribute when flexbox is supported', function () {
      var mainView = new MainView(this.mainViewOptions);
      var wrapper = mainView.element;

      mainView.supportsFlexbox = true;

      mainView.setPrimaryView(CardView.ID);

      expect(wrapper.dataset.braintreeNoFlexbox).to.not.exist;
    });

    describe('when given a ', function () {
      Object.keys(sheetViews).forEach(function (sheetViewKey) {
        var SheetView = sheetViews[sheetViewKey];

        describe(SheetView.ID + ' view', function () {
          describe('in a non-guest checkout flow', function () {
            it('shows the additional options button', function () {
              var mainView;

              this.mainViewOptions.merchantConfiguration.authorization = fake.clientTokenWithCustomerID;

              mainView = new MainView(this.mainViewOptions);
              mainView.setPrimaryView(SheetView.ID);

              expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.false;
            });

            it('does not show the additional options button if there are no vaulted payment methods', function () {
              var mainView, model;
              var modelOptions = fake.modelOptions();

              modelOptions.paymentMethods = [];
              modelOptions.merchantConfiguration.authorization = fake.clientTokenWithCustomerID;
              model = fake.model(modelOptions);

              return model.initialize().then(function () {
                model.supportedPaymentOptions = [sheetViewKey];

                this.mainViewOptions.model = model;

                mainView = new MainView(this.mainViewOptions);

                mainView.setPrimaryView(SheetView.ID);

                expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.true;
              }.bind(this));
            });
          });

          describe('in a guest checkout flow', function () {
            it('shows the additional options button if there are multiple payment options', function () {
              var mainView;

              this.mainViewOptions.merchantConfiguration.authorization = fake.clientTokenWithCustomerID;

              mainView = new MainView(this.mainViewOptions);
              mainView.setPrimaryView(SheetView.ID);

              expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.false;
            });

            it('does not show the additional options button if there is one payment option', function () {
              var mainView;

              this.mainViewOptions.model.supportedPaymentOptions = [sheetViewKey];
              this.mainViewOptions.merchantConfiguration.authorization = fake.tokenizationKey;

              mainView = new MainView(this.mainViewOptions);
              mainView.setPrimaryView(SheetView.ID);

              expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.true;
            });
          });
        });
      });
    });

    describe('when given a PaymentMethodsView', function () {
      it('shows the additional options button', function () {
        var mainView = new MainView(this.mainViewOptions);

        mainView.setPrimaryView(PaymentMethodsView.ID);

        expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.false;
      });
    });

    describe('when given a PaymentOptionsView', function () {
      it('hides the additional options button', function () {
        var mainView = new MainView(this.mainViewOptions);

        mainView.setPrimaryView(PaymentOptionsView.ID);

        expect(mainView.toggle.classList.contains('braintree-hidden')).to.be.true;
      });
    });

    it('calls setPaymentMethodRequestable when there is a payment method requestable', function () {
      var fakePaymentMethod = {
        type: 'TYPE',
        nonce: 'some-nonce'
      };
      var mainView = new MainView(this.mainViewOptions);

      this.sandbox.stub(BaseView.prototype, 'getPaymentMethod').returns(fakePaymentMethod);
      this.sandbox.stub(mainView.model, 'setPaymentMethodRequestable');

      mainView.setPrimaryView(PaymentOptionsView.ID);

      expect(mainView.model.setPaymentMethodRequestable).to.be.calledWith({
        isRequestable: true,
        type: 'TYPE',
        selectedPaymentMethod: fakePaymentMethod
      });
    });

    it('does not call setPaymentMethodRequestable when in edit mode', function () {
      var fakePaymentMethod = {
        type: 'TYPE',
        nonce: 'some-nonce'
      };
      var mainView = new MainView(this.mainViewOptions);

      this.sandbox.stub(BaseView.prototype, 'getPaymentMethod').returns(fakePaymentMethod);
      this.sandbox.stub(mainView.model, 'setPaymentMethodRequestable');
      this.sandbox.stub(mainView.model, 'isInEditMode').returns(true);

      mainView.setPrimaryView(PaymentOptionsView.ID);

      expect(mainView.model.setPaymentMethodRequestable).to.be.calledWith({
        isRequestable: false,
        type: 'TYPE',
        selectedPaymentMethod: fakePaymentMethod
      });
    });

    it('calls setPaymentMethodRequestable when there is no payment method requestable', function () {
      var mainView = new MainView(this.mainViewOptions);

      this.sandbox.stub(BaseView.prototype, 'getPaymentMethod').returns(false);
      this.sandbox.stub(mainView.model, 'setPaymentMethodRequestable');

      mainView.setPrimaryView(PaymentOptionsView.ID);

      expect(mainView.model.setPaymentMethodRequestable).to.be.calledWithMatch({
        isRequestable: false
      });
    });
  });

  describe('showSheetError', function () {
    beforeEach(function () {
      this.context = {
        dropinContainer: document.createElement('div'),
        sheetErrorText: document.createElement('div'),
        strings: strings
      };
    });

    it('applies the braintree-sheet--has-error class to dropin container', function () {
      MainView.prototype.showSheetError.call(this.context, {});

      expect(this.context.dropinContainer.classList.contains('braintree-sheet--has-error')).to.be.true;
    });

    it('sets the error text to the expected message for the error code', function () {
      var fakeError = {
        code: 'HOSTED_FIELDS_FAILED_TOKENIZATION',
        message: 'Some text we do not use'
      };

      MainView.prototype.showSheetError.call(this.context, fakeError);

      expect(this.context.sheetErrorText.textContent).to.equal('Please check your information and try again.');
    });

    it('shows a fallback error message when the error code is unknown and the error is missing a message', function () {
      var fakeError = {
        code: 'AN_UNKNOWN_ERROR'
      };

      MainView.prototype.showSheetError.call(this.context, fakeError);

      expect(this.context.sheetErrorText.textContent).to.equal('Something went wrong on our end.');
    });

    it('shows a developer error message when error is "developerError"', function () {
      var fakeError = 'developerError';

      MainView.prototype.showSheetError.call(this.context, fakeError);

      expect(this.context.sheetErrorText.textContent).to.equal('Developer Error: Something went wrong. Check the console for details.');
    });
  });

  describe('hideSheetError', function () {
    beforeEach(function () {
      this.context = {
        dropinContainer: document.createElement('div')
      };
    });

    it('removes the braintree-sheet--has-error class from dropin container', function () {
      classList.add(this.context.dropinContainer, 'braintree-sheet--has-error');

      MainView.prototype.hideSheetError.call(this.context);

      expect(this.context.dropinContainer.classList.contains('braintree-sheet--has-error')).to.be.false;
    });
  });

  describe('dropinErrorState events', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        this.context = {
          addView: this.sandbox.stub(),
          element: element,
          getElementById: BaseView.prototype.getElementById,
          enableEditMode: this.sandbox.stub(),
          disableEditMode: this.sandbox.stub(),
          openConfirmPaymentMethodDeletionDialog: this.sandbox.stub(),
          cancelVaultedPaymentMethodDeletion: this.sandbox.stub(),
          startVaultedPaymentMethodDeletion: this.sandbox.stub(),
          finishVaultedPaymentMethodDeletion: this.sandbox.stub(),
          hideSheetError: this.sandbox.stub(),
          hideLoadingIndicator: function () {},
          _sendToDefaultView: this.sandbox.stub(),
          _onChangeActivePaymentMethodView: this.sandbox.stub(),
          model: model,
          client: fake.client(),
          setPrimaryView: this.sandbox.stub(),
          showSheetError: this.sandbox.stub(),
          allowUserAction: this.sandbox.stub(),
          preventUserAction: this.sandbox.stub(),
          toggleAdditionalOptions: function () {},
          showLoadingIndicator: function () {},
          strings: strings
        };

        MainView.prototype._initialize.call(this.context);
      }.bind(this));
    });

    it('calls showSheetError when errorOccurred is emitted', function () {
      var fakeError = {
        code: 'HOSTED_FIELDS_FAILED_TOKENIZATION'
      };

      this.context.model._emit('errorOccurred', fakeError);

      expect(this.context.showSheetError).to.be.calledWith(fakeError);
    });

    it('calls hideSheetError when errorCleared is emitted', function () {
      this.context.model._emit('errorCleared');

      expect(this.context.hideSheetError).to.be.called;
    });
  });

  describe('hideLoadingIndicator', function () {
    it('sets the loaded class on dropin container', function () {
      var dropinContainer = document.createElement('div');
      var loadingContainer = document.createElement('div');
      var context = {
        loadingContainer: loadingContainer,
        dropinContainer: dropinContainer
      };

      MainView.prototype.hideLoadingIndicator.call(context);

      expect(dropinContainer.classList.contains('braintree-loaded')).to.equal(true);
    });
  });

  describe('showLoadingIndicator', function () {
    it('shows the loading indicator', function () {
      var dropinContainer = document.createElement('div');
      var loadingContainer = document.createElement('div');
      var context = {
        loadingContainer: loadingContainer,
        dropinContainer: dropinContainer
      };

      MainView.prototype.hideLoadingIndicator.call(context);

      expect(dropinContainer.classList.contains('braintree-loaded')).to.equal(true);

      MainView.prototype.showLoadingIndicator.call(context);

      expect(dropinContainer.classList.contains('braintree-loaded')).to.equal(false);
    });
  });

  describe('DropinModel events', function () {
    beforeEach(function () {
      this.element = document.createElement('div');
      this.element.innerHTML = templateHTML;
      this.model = fake.model();

      return this.model.initialize().then(function () {
        this.mainViewOptions = {
          element: this.element,
          model: this.model,
          client: this.client,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          strings: strings
        };

        this.sandbox.stub(CardView.prototype, 'initialize');
        this.sandbox.spy(MainView.prototype, 'hideLoadingIndicator');

        this.mainView = new MainView(this.mainViewOptions);
        this.mainView._views = {
          methods: {
            onSelection: this.sandbox.stub()
          },
          card: {
            getPaymentMethod: this.sandbox.stub(),
            onSelection: this.sandbox.stub()
          },
          paypal: {
            getPaymentMethod: this.sandbox.stub(),
            onSelection: this.sandbox.stub()
          }
        };
      }.bind(this));
    });

    describe('for changeActivePaymentMethod', function () {
      it('sets the PaymentMethodsView as the primary view', function (done) {
        this.mainView.paymentMethodsViews.activeMethodView = {setActive: function () {}};
        this.sandbox.stub(this.mainView, 'setPrimaryView');

        this.model._emit('changeActivePaymentMethod', {});

        setTimeout(function () {
          expect(this.mainView.setPrimaryView).to.be.called;
          done();
        }.bind(this), CHANGE_ACTIVE_PAYMENT_METHOD_TIMEOUT);
      });
    });

    describe('for removeActivePaymentMethod', function () {
      it('calls removeActivePaymentMethod if there is an active view', function (done) {
        var optionsView = {ID: 'options', removeActivePaymentMethod: this.sandbox.stub()};

        this.mainView.addView(optionsView);

        this.sandbox.stub(this.model, 'getActivePaymentView').returns('options');
        this.model._emit('removeActivePaymentMethod');

        setTimeout(function () {
          expect(optionsView.removeActivePaymentMethod).to.be.calledOnce;
          done();
        }, CHANGE_ACTIVE_PAYMENT_METHOD_TIMEOUT);
      });
    });

    describe('for changeActivePaymentView', function () {
      beforeEach(function () {
        this.sandbox.stub(this.model, 'setPaymentMethodRequestable');
        this.paymentMethodsContainer = this.element.querySelector('[data-braintree-id="methods-container"]');
        this.sheetElement = this.element.querySelector('[data-braintree-id="sheet-container"]');
      });

      describe('when the PaymentMethodsView is active', function () {
        beforeEach(function () {
          classList.remove(this.paymentMethodsContainer, 'braintree-methods--active');
          classList.add(this.sheetElement, 'braintree-sheet--active');
        });

        it('adds braintree-methods--active to the payment methods view element', function () {
          this.model._emit('changeActivePaymentView', PaymentMethodsView.ID);
          expect(this.paymentMethodsContainer.className).to.contain('braintree-methods--active');
        });

        it('removes braintree-sheet--active from the payment sheet element', function () {
          this.model._emit('changeActivePaymentView', PaymentMethodsView.ID);
          expect(this.sheetElement.className).to.not.contain('braintree-sheet--active');
        });

        it('does not call model.setPaymentMethodRequestable', function () {
          this.model._emit('changeActivePaymentView', PaymentMethodsView.ID);
          expect(this.model.setPaymentMethodRequestable).to.not.be.called;
        });

        it('calls onSelection', function () {
          this.model._emit('changeActivePaymentView', PaymentMethodsView.ID);
          expect(this.mainView._views.methods.onSelection).to.be.calledOnce;
        });
      });

      describe('when a payment sheet is active', function () {
        beforeEach(function () {
          this.sandbox.useFakeTimers();

          classList.add(this.paymentMethodsContainer, 'braintree-methods--active');
          classList.remove(this.sheetElement, 'braintree-sheet--active');
        });

        [CardView, PayPalView].forEach(function (PaymentSheetView) {
          var ID = PaymentSheetView.ID;

          describe('using a ' + ID + ' sheet', function () {
            beforeEach(function () {
              this.model._emit('changeActivePaymentView', ID);
            });

            it('adds braintree-sheet--active to the payment sheet', function () {
              this.sandbox.clock.tick(1001);
              expect(this.sheetElement.className).to.contain('braintree-sheet--active');
            });

            it('removes braintree-methods--active from the payment methods view', function () {
              this.sandbox.clock.tick(1001);
              expect(this.paymentMethodsContainer.className).to.not.contain('braintree-methods--active');
            });

            it('calls model.setPaymentMethodRequestable', function () {
              expect(this.model.setPaymentMethodRequestable).to.be.calledWith({
                isRequestable: false
              });
            });

            it('calls onSelection on specific view', function () {
              var view = this.mainView._views[ID];

              expect(view.onSelection).to.be.calledOnce;
            });
          });
        });
      });
    });
  });

  describe('additional options toggle', function () {
    beforeEach(function () {
      var model = fake.model();

      this.wrapper = document.createElement('div');
      this.wrapper.innerHTML = templateHTML;

      return model.initialize().then(function () {
        this.mainViewOptions = {
          element: this.wrapper,
          client: this.client,
          model: model,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          strings: strings
        };
        this.sandbox.stub(PayPalCheckout, 'create').yields(null, {});
      }.bind(this));
    });

    it('has an click event listener that calls toggleAdditionalOptions', function () {
      var mainView;

      this.sandbox.stub(MainView.prototype, 'toggleAdditionalOptions');

      mainView = new MainView(this.mainViewOptions);

      mainView.toggle.click();

      expect(mainView.toggleAdditionalOptions).to.have.been.called;
    });

    it('hides toggle', function () {
      var mainView = new MainView(this.mainViewOptions);

      mainView.toggle.click();

      expect(mainView.toggle.className).to.contain('braintree-hidden');
    });

    describe('when there is one payment option', function () {
      beforeEach(function () {
        this.mainViewOptions.model.supportedPaymentOptions = ['card'];
        this.mainView = new MainView(this.mainViewOptions);

        this.mainView.setPrimaryView(PaymentMethodsView.ID);
        this.mainView.toggle.click();
      });

      it('sets the payment option as the active payment view', function () {
        expect(this.mainView.model.getActivePaymentView()).to.equal(CardView.ID);
      });

      it('exposes the payment sheet view', function () {
        expect(this.wrapper.className).to.contain('braintree-show-' + CardView.ID);
      });
    });

    describe('when there are multiple payment options and a payment sheet view is active', function () {
      beforeEach(function () {
        this.mainViewOptions.model.supportedPaymentOptions = ['card', 'paypal'];
        this.sandbox.useFakeTimers();
      });

      describe('and there are no payment methods available', function () {
        it('sets the PaymentOptionsView as the primary view', function () {
          var mainView = new MainView(this.mainViewOptions);

          this.sandbox.spy(mainView, 'setPrimaryView');
          mainView.setPrimaryView(CardView.ID);
          mainView.toggle.click();
          this.sandbox.clock.tick(1);

          expect(mainView.setPrimaryView).to.have.been.calledWith(PaymentOptionsView.ID);
          expect(this.wrapper.className).to.contain('braintree-show-' + PaymentOptionsView.ID);
        });
      });

      describe('and there are payment methods available', function () {
        beforeEach(function () {
          this.mainViewOptions.model = fake.model();
          this.mainViewOptions.model.getVaultedPaymentMethods.resolves([{type: 'CreditCard', details: {lastTwo: '11'}}]);

          return this.mainViewOptions.model.initialize().then(function () {
            this.mainViewOptions.model.supportedPaymentOptions = ['card', 'paypal'];
            this.mainView = new MainView(this.mainViewOptions);

            this.sandbox.spy(this.mainView, 'setPrimaryView');

            this.mainView.setPrimaryView(CardView.ID);
            this.mainView.toggle.click();
            this.sandbox.clock.tick(1);
          }.bind(this));
        });

        it('sets the PaymentMethodsView as the primary view', function () {
          expect(this.mainView.setPrimaryView).to.have.been.calledWith(PaymentMethodsView.ID, this.sandbox.match.any);
          expect(this.wrapper.className).to.contain('braintree-show-' + PaymentMethodsView.ID);
          expect(this.mainView.model.getActivePaymentView()).to.equal(PaymentMethodsView.ID);
        });

        it('exposes the PaymentOptionsView', function () {
          expect(this.wrapper.className).to.contain('braintree-show-' + PaymentOptionsView.ID);
        });

        it('hides the toggle', function () {
          expect(this.mainView.toggle.className).to.contain('braintree-hidden');
        });
      });
    });
  });

  describe('requestPaymentMethod', function () {
    beforeEach(function () {
      var model = fake.model();

      this.wrapper = document.createElement('div');
      this.wrapper.innerHTML = templateHTML;

      return model.initialize().then(function () {
        this.mainView = new MainView({
          element: this.wrapper,
          model: model,
          client: this.client,
          merchantConfiguration: {
            authorization: 'fake_tokenization_key'
          },
          strings: strings
        });
      }.bind(this));
    });

    it('requests payment method from the primary view', function () {
      this.sandbox.stub(CardView.prototype, 'requestPaymentMethod').resolves({});

      this.mainView.requestPaymentMethod();

      expect(this.mainView.primaryView.requestPaymentMethod).to.be.called;
    });

    it('calls callback with error when error occurs', function () {
      var fakeError = new Error('A bad thing happened');

      this.sandbox.stub(CardView.prototype, 'requestPaymentMethod').rejects(fakeError);

      return this.mainView.requestPaymentMethod().then(function () {
        throw new Error('should not resolve');
      }).catch(function (err) {
        expect(err).to.equal(fakeError);
        expect(analytics.sendEvent).to.be.calledWith(this.client, 'request-payment-method.error');
      }.bind(this));
    });

    it('calls callback with payload when successful', function () {
      var stubPaymentMethod = {foo: 'bar'};

      this.sandbox.stub(CardView.prototype, 'requestPaymentMethod').resolves(stubPaymentMethod);

      return this.mainView.requestPaymentMethod().then(function (payload) {
        expect(payload).to.equal(stubPaymentMethod);
      });
    });

    it('sends analytics event for successful CreditCard', function () {
      var stubPaymentMethod = {type: 'CreditCard'};

      this.sandbox.stub(CardView.prototype, 'requestPaymentMethod').resolves(stubPaymentMethod);

      return this.mainView.requestPaymentMethod().then(function () {
        expect(analytics.sendEvent).to.be.calledWith(this.client, 'request-payment-method.card');
      }.bind(this));
    });

    it('sends analytics event for successful PayPalAccount', function () {
      var stubPaymentMethod = {type: 'PayPalAccount'};

      this.sandbox.stub(CardView.prototype, 'requestPaymentMethod').resolves(stubPaymentMethod);

      return this.mainView.requestPaymentMethod().then(function () {
        expect(analytics.sendEvent).to.be.calledWith(this.client, 'request-payment-method.paypal');
      }.bind(this));
    });

    describe('with vaulted payment methods', function () {
      beforeEach(function () {
        var model = fake.model();

        this.wrapper = document.createElement('div');
        this.wrapper.innerHTML = templateHTML;
        this.sandbox.stub(hostedFields, 'create').resolves(fake.HostedFieldsInstance);

        return model.initialize().then(function () {
          model.supportedPaymentOptions = ['card'];

          this.mainView = new MainView({
            element: this.wrapper,
            client: this.client,
            model: model,
            merchantConfiguration: {
              authorization: fake.clientTokenWithCustomerID
            },
            strings: strings
          });
        }.bind(this));
      });

      it('requests payment method from payment methods view', function () {
        var paymentMethodsViews = this.mainView.getView(PaymentMethodsView.ID);

        this.mainView.model.changeActivePaymentView(PaymentMethodsView.ID);
        this.sandbox.stub(paymentMethodsViews, 'requestPaymentMethod').resolves({});

        return this.mainView.requestPaymentMethod().then(function () {
          expect(paymentMethodsViews.requestPaymentMethod).to.be.called;
        });
      });

      it('requests payment method from card view when additional options are shown', function () {
        var cardView = this.mainView.getView(CardView.ID);

        this.sandbox.stub(cardView, 'requestPaymentMethod').resolves({});
        this.mainView.toggleAdditionalOptions();

        return this.mainView.requestPaymentMethod().then(function () {
          expect(cardView.requestPaymentMethod).to.be.called;
        });
      });
    });
  });

  describe('teardown', function () {
    beforeEach(function () {
      this.context = {
        _views: {
          'braintree-card-view': {
            teardown: this.sandbox.stub().resolves()
          }
        }
      };
    });

    it('calls teardown on each view', function () {
      var payWithCardView = this.context._views['braintree-card-view'];

      return MainView.prototype.teardown.call(this.context).then(function () {
        expect(payWithCardView.teardown).to.be.calledOnce;
      });
    });

    it('waits to call callback until asynchronous teardowns complete', function () {
      var payWithCardView = this.context._views['braintree-card-view'];

      payWithCardView.teardown = function () {
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve();
          }, 300);
        });
      };

      return MainView.prototype.teardown.call(this.context);
    });

    it('calls callback with error from teardown function', function () {
      var payWithCardView = this.context._views['braintree-card-view'];
      var error = new Error('pay with card teardown error');

      payWithCardView.teardown.rejects(error);

      return MainView.prototype.teardown.call(this.context).then(function () {
        throw new Error('should not resolve');
      }).catch(function (err) {
        expect(err).to.equal(error);
      });
    });
  });

  describe('getOptionsElements', function () {
    it('returns options view elements property', function () {
      var elements = {};
      var context = {
        _views: {
          options: {
            elements: elements
          }
        }
      };

      expect(MainView.prototype.getOptionsElements.call(context)).to.equal(elements);
    });
  });

  describe('preventUserAction', function () {
    it('displays disable wrapper', function () {
      var wrapper = {};
      var context = {
        disableWrapper: wrapper
      };

      this.sandbox.stub(classList, 'remove');

      MainView.prototype.preventUserAction.call(context);

      expect(classList.remove).to.be.calledWith(wrapper, 'braintree-hidden');
    });
  });

  describe('allowUserAction', function () {
    it('hides disable wrapper', function () {
      var wrapper = {};
      var context = {
        disableWrapper: wrapper
      };

      this.sandbox.stub(classList, 'add');

      MainView.prototype.allowUserAction.call(context);

      expect(classList.add).to.be.calledWith(wrapper, 'braintree-hidden');
    });
  });

  describe('enableEditMode', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);
      }.bind(this));
    });

    it('enables edit mode on the payment methods view', function () {
      this.sandbox.stub(this.mainView.paymentMethodsViews, 'enableEditMode');

      this.mainView.enableEditMode();

      expect(this.mainView.paymentMethodsViews.enableEditMode).to.be.calledOnce;
    });

    it('hides the toggle button', function () {
      this.sandbox.stub(this.mainView, 'hideToggle');

      this.mainView.enableEditMode();

      expect(this.mainView.hideToggle).to.be.calledOnce;
    });

    it('sets payment method requestable to false', function () {
      this.sandbox.stub(this.mainView.model, 'setPaymentMethodRequestable');

      this.mainView.enableEditMode();

      expect(this.mainView.model.setPaymentMethodRequestable).to.be.calledWith({
        isRequestable: false
      });
    });
  });

  describe('disableEditMode', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);
      }.bind(this));
    });

    it('disables edit mode on the payment methods view', function () {
      this.sandbox.stub(this.mainView.paymentMethodsViews, 'disableEditMode');

      this.mainView.disableEditMode();

      expect(this.mainView.paymentMethodsViews.disableEditMode).to.be.calledOnce;
    });

    it('shows the toggle button', function () {
      this.sandbox.stub(this.mainView, 'showToggle');

      this.mainView.disableEditMode();

      expect(this.mainView.showToggle).to.be.calledOnce;
    });

    it('sets payment method requestable to true when a payment method is available', function () {
      var fakePaymentMethod = {
        type: 'TYPE',
        nonce: 'some-nonce'
      };

      this.mainView.primaryView.getPaymentMethod.returns(fakePaymentMethod);
      this.sandbox.stub(this.mainView.model, 'setPaymentMethodRequestable');

      this.mainView.disableEditMode();

      expect(this.mainView.model.setPaymentMethodRequestable).to.be.calledWith({
        isRequestable: true,
        type: 'TYPE',
        selectedPaymentMethod: fakePaymentMethod
      });
    });

    it('sets payment method requestable to false when no payment methods are available', function () {
      this.sandbox.stub(BaseView.prototype, 'getPaymentMethod').returns(false);
      this.sandbox.stub(this.mainView.model, 'setPaymentMethodRequestable');

      this.mainView.disableEditMode();

      expect(this.mainView.model.setPaymentMethodRequestable).to.be.calledWithMatch({
        isRequestable: false
      });
    });
  });

  describe('openConfirmPaymentMethodDeletionDialog', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);

        this.sandbox.stub(this.mainView.deleteConfirmationView, 'applyPaymentMethod');
        this.sandbox.stub(this.mainView, 'setPrimaryView');
      }.bind(this));
    });

    it('updates delete confirmation view with payment method', function () {
      var paymentMethod = {nonce: 'a-nonce'};

      this.mainView.openConfirmPaymentMethodDeletionDialog(paymentMethod);

      expect(this.mainView.deleteConfirmationView.applyPaymentMethod).to.be.calledOnce;
      expect(this.mainView.deleteConfirmationView.applyPaymentMethod).to.be.calledWith(paymentMethod);
    });

    it('sets primary view to delete confirmation view', function () {
      var paymentMethod = {nonce: 'a-nonce'};

      this.mainView.openConfirmPaymentMethodDeletionDialog(paymentMethod);

      expect(this.mainView.setPrimaryView).to.be.calledOnce;
      expect(this.mainView.setPrimaryView).to.be.calledWith('delete-confirmation');
    });
  });

  describe('cancelVaultedPaymentMethodDeletion', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);
        this.sandbox.stub(this.mainView, 'setPrimaryView');
      }.bind(this));
    });

    it('sets primary view to methods view', function () {
      this.mainView.cancelVaultedPaymentMethodDeletion();

      expect(this.mainView.setPrimaryView).to.be.calledOnce;
      expect(this.mainView.setPrimaryView).to.be.calledWith('methods');
    });
  });

  describe('startVaultedPaymentMethodDeletion', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);
      }.bind(this));
    });

    it('calls showLoadingIndicator', function () {
      this.sandbox.stub(this.mainView, 'showLoadingIndicator');
      this.mainView.startVaultedPaymentMethodDeletion();
      expect(this.mainView.showLoadingIndicator).to.be.calledOnce;
    });

    it('removes classes from dropin wrapper', function () {
      this.mainView.element.className = 'braintree-show-methods';

      this.mainView.startVaultedPaymentMethodDeletion();

      expect(this.mainView.element.className).to.equal('');
    });
  });

  describe('finishVaultedPaymentMethodDeletion', function () {
    beforeEach(function () {
      var element = document.createElement('div');
      var model = fake.model();

      element.innerHTML = templateHTML;

      return model.initialize().then(function () {
        model.supportedPaymentOptions = ['card'];
        this.mainViewOptions = {
          client: this.client,
          element: element,
          merchantConfiguration: {
            authorization: fake.tokenizationKey
          },
          model: model,
          strings: strings
        };
        this.mainView = new MainView(this.mainViewOptions);
      }.bind(this));
    });

    it('refreshes payment methods view', function () {
      this.sandbox.stub(this.mainView.paymentMethodsViews, 'refreshPaymentMethods');

      return this.mainView.finishVaultedPaymentMethodDeletion().then(function () {
        expect(this.mainView.paymentMethodsViews.refreshPaymentMethods).to.be.calledOnce;
      }.bind(this));
    });

    it('calls hideLoadingIndicator after half a second', function () {
      this.sandbox.stub(this.mainView, 'hideLoadingIndicator');

      return this.mainView.finishVaultedPaymentMethodDeletion().then(function () {
        expect(this.mainView.hideLoadingIndicator).to.be.calledOnce;
      }.bind(this));
    });

    it('sends customer back to their initial view', function () {
      this.sandbox.stub(this.mainView, '_sendToDefaultView');

      return this.mainView.finishVaultedPaymentMethodDeletion().then(function () {
        expect(this.mainView._sendToDefaultView).to.be.calledOnce;
      }.bind(this));
    });

    it('re-enables edit mode when it errors', function () {
      var err = new Error('some error');
      var fakePaymentMethod = {
        type: 'TYPE',
        nonce: 'some-nonce'
      };

      this.sandbox.stub(this.mainView.model, 'enableEditMode');
      this.sandbox.stub(this.mainView.model, 'getPaymentMethods').returns([fakePaymentMethod]);

      return this.mainView.finishVaultedPaymentMethodDeletion(err).then(function () {
        expect(this.mainView.model.enableEditMode).to.be.calledOnce;
      }.bind(this));
    });

    it('shows sheet error when it errors', function () {
      var err = new Error('some error');
      var fakePaymentMethod = {
        type: 'TYPE',
        nonce: 'some-nonce'
      };

      this.sandbox.stub(this.mainView, 'showSheetError');
      this.sandbox.stub(this.mainView.model, 'getPaymentMethods').returns([fakePaymentMethod]);

      return this.mainView.finishVaultedPaymentMethodDeletion(err).then(function () {
        expect(this.mainView.showSheetError).to.be.calledOnce;
      }.bind(this));
    });

    it('sends customer back to their initial view if erros but there are no saved payment methods', function () {
      var err = new Error('some error');

      this.sandbox.stub(this.mainView, '_sendToDefaultView');
      this.sandbox.stub(this.mainView.model, 'getPaymentMethods').returns([]);

      return this.mainView.finishVaultedPaymentMethodDeletion(err).then(function () {
        expect(this.mainView._sendToDefaultView).to.be.calledOnce;
      }.bind(this));
    });
  });
});
