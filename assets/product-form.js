if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        
        // DEBUG: Check if cart elements exist
        console.log('Cart Notification Element:', document.querySelector('cart-notification'));
        console.log('Cart Drawer Element:', document.querySelector('cart-drawer'));
        
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        console.log('Selected Cart Element:', this.cart);
        
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('cart-drawer')) {
          this.submitButton.setAttribute('aria-haspopup', 'dialog');
          console.log('Added aria-haspopup to submit button');
        } else {
          console.log('No cart-drawer found for aria-haspopup attribute');
        }

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            // DEBUG: Log the response structure to check for expected properties
            console.log('Cart Add Response:', response);
            console.log('Response has sections:', !!response.sections);
            console.log('Response has items:', !!response.items);
            
            if (response.status) {
              publish(PUB_SUB_EVENTS.cartError, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                errors: response.errors || response.description,
                message: response.message,
              });
              this.handleErrorMessage(response.description);

              const soldOutMessage = this.submitButton.querySelector('.sold-out-message');
              if (!soldOutMessage) return;
              this.submitButton.setAttribute('aria-disabled', true);
              this.submitButtonText.classList.add('hidden');
              soldOutMessage.classList.remove('hidden');
              this.error = true;
              return;
            } else if (!this.cart) {
              console.log('No cart found, redirecting to cart page');
              window.location = window.routes.cart_url;
              return;
            }

            if (!this.error)
              publish(PUB_SUB_EVENTS.cartUpdate, {
                source: 'product-form',
                productVariantId: formData.get('id'),
                cartData: response,
              });
            this.error = false;
            const quickAddModal = this.closest('quick-add-modal');
            if (quickAddModal) {
              document.body.addEventListener(
                'modalClosed',
                () => {
                  setTimeout(() => {
                    // Ensure the response is properly structured before rendering
                    if (response && (response.sections || response.items)) {
                      console.log('Rendering cart contents from quick-add-modal');
                      this.cart.renderContents(response);
                    } else {
                      console.warn('Invalid cart response format. Redirecting to cart page.');
                      window.location.href = window.routes.cart_url;
                    }
                  });
                },
                { once: true }
              );
              quickAddModal.hide(true);
            } else {
              console.log('About to fetch cart sections and render');
              
              // After adding to cart, we need to fetch the sections separately
              // because /cart/add.js doesn't return sections
              const sectionsToRender = this.cart.getSectionsToRender();
              
              // Fetch each section individually
              const sectionPromises = sectionsToRender.map(section => {
                const sectionId = section.section || section.id;
                return fetch(`/?section_id=${sectionId}`)
                  .then(res => res.text())
                  .then(html => ({ id: sectionId, html }));
              });
              
              Promise.all(sectionPromises)
                .then(sections => {
                  console.log('Fetched sections:', sections.map(s => s.id));
                  
                  // Convert to sections object format
                  const sectionsObj = {};
                  sections.forEach(({ id, html }) => {
                    sectionsObj[id] = html;
                  });
                  
                  // Combine the cart data with sections
                  const combinedResponse = {
                    ...response,
                    sections: sectionsObj
                  };
                  
                  // Now render with sections
                  this.cart.renderContents(combinedResponse);
                })
                .catch(error => {
                  console.error('Error fetching sections:', error);
                  // Fallback: just open the drawer with existing content
                  if (this.cart && typeof this.cart.open === 'function') {
                    this.cart.open();
                  }
                });
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove('loading');
            if (this.cart && this.cart.classList.contains('is-empty')) this.cart.classList.remove('is-empty');
            if (!this.error) this.submitButton.removeAttribute('aria-disabled');
            this.querySelector('.loading__spinner').classList.add('hidden');
          });
      }

      handleErrorMessage(errorMessage = false) {
        if (this.hideErrors) return;

        this.errorMessageWrapper =
          this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
        if (!this.errorMessageWrapper) return;
        this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

        this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

        if (errorMessage) {
          this.errorMessage.textContent = errorMessage;
        }
      }

      toggleSubmitButton(disable = true, text) {
        if (disable) {
          this.submitButton.setAttribute('disabled', 'disabled');
          if (text) this.submitButtonText.textContent = text;
        } else {
          this.submitButton.removeAttribute('disabled');
          this.submitButtonText.textContent = window.variantStrings.addToCart;
        }
      }

      get variantIdInput() {
        return this.form.querySelector('[name=id]');
      }
    }
  );
}
