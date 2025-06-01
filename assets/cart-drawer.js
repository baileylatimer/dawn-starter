class CartDrawer extends HTMLElement {
  constructor() {
    super();

    console.log('CartDrawer initialized');
    this.addEventListener('keyup', (evt) => evt.code === 'Escape' && this.close());
    this.querySelector('#CartDrawer-Overlay').addEventListener('click', this.close.bind(this));
    this.setHeaderCartIconAccessibility();
  }

  setHeaderCartIconAccessibility() {
    const cartLink = document.querySelector('#cart-icon-bubble');
    cartLink.setAttribute('role', 'button');
    cartLink.setAttribute('aria-haspopup', 'dialog');
    cartLink.addEventListener('click', (event) => {
      event.preventDefault();
      this.open(cartLink);
    });
    cartLink.addEventListener('keydown', (event) => {
      if (event.code.toUpperCase() === 'SPACE') {
        event.preventDefault();
        this.open(cartLink);
      }
    });
  }

  open(triggeredBy) {
    console.log('CartDrawer.open() called', { triggeredBy });
    if (triggeredBy) this.setActiveElement(triggeredBy);
    const cartDrawerNote = this.querySelector('[id^="Details-"] summary');
    if (cartDrawerNote && !cartDrawerNote.hasAttribute('role')) this.setSummaryAccessibility(cartDrawerNote);
    // here the animation doesn't seem to always get triggered. A timeout seem to help
    setTimeout(() => {
      console.log('Adding animate and active classes to cart drawer');
      this.classList.add('animate', 'active');
    });

    this.addEventListener(
      'transitionend',
      () => {
        const containerToTrapFocusOn = this.classList.contains('is-empty')
          ? this.querySelector('.drawer__inner-empty')
          : document.getElementById('CartDrawer');
        const focusElement = this.querySelector('.drawer__inner') || this.querySelector('.drawer__close');
        console.log('Cart drawer transition ended, trapping focus');
        trapFocus(containerToTrapFocusOn, focusElement);
      },
      { once: true }
    );

    document.body.classList.add('overflow-hidden');
  }

  close() {
    console.log('CartDrawer.close() called');
    this.classList.remove('active');
    removeTrapFocus(this.activeElement);
    document.body.classList.remove('overflow-hidden');
  }

  setSummaryAccessibility(cartDrawerNote) {
    cartDrawerNote.setAttribute('role', 'button');
    cartDrawerNote.setAttribute('aria-expanded', 'false');

    if (cartDrawerNote.nextElementSibling.getAttribute('id')) {
      cartDrawerNote.setAttribute('aria-controls', cartDrawerNote.nextElementSibling.id);
    }

    cartDrawerNote.addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', !event.currentTarget.closest('details').hasAttribute('open'));
    });

    cartDrawerNote.parentElement.addEventListener('keyup', onKeyUpEscape);
  }

  renderContents(parsedState) {
    console.log('CartDrawer.renderContents() called', { parsedState });
    
    try {
      // Check if drawer inner exists
      const drawerInner = this.querySelector('.drawer__inner');
      if (!drawerInner) {
        console.error('Drawer inner element not found');
        // Continue anyway to open the drawer
      } else {
        // Remove is-empty class if it exists
        if (drawerInner.classList.contains('is-empty')) {
          drawerInner.classList.remove('is-empty');
        }
      }
      
      // Store product ID if available
      if (parsedState && parsedState.id) {
        this.productId = parsedState.id;
      }
      
      // Check if sections exists in parsedState before trying to render
      if (parsedState && parsedState.sections) {
        console.log('Cart drawer sections found:', Object.keys(parsedState.sections));
        
        const sectionsToRender = this.getSectionsToRender();
        console.log('Sections to render:', sectionsToRender);
        
        sectionsToRender.forEach((section) => {
          try {
            const sectionElement = section.selector
              ? document.querySelector(section.selector)
              : document.getElementById(section.id);
            
            console.log(`Looking for section element with ${section.selector ? 'selector' : 'id'}: ${section.selector || section.id}`, { found: !!sectionElement });
            
            if (sectionElement && parsedState.sections[section.id]) {
              console.log(`Updating section ${section.id}`);
              sectionElement.innerHTML = this.getSectionInnerHTML(parsedState.sections[section.id], section.selector);
            } else {
              console.warn(`Could not update section ${section.id} - Element or section data not found`);
            }
          } catch (sectionError) {
            console.error(`Error updating section ${section.id}:`, sectionError);
            // Continue with other sections
          }
        });
      } else {
        console.warn('Cart sections not found in the response');
        // We'll just open the drawer without updating contents
      }
    } catch (error) {
      console.error('Error in renderContents:', error);
      // Continue to open the drawer even if there was an error
    }

    // Always try to open the drawer, even if we encountered errors
    setTimeout(() => {
      console.log('Setting up overlay and opening drawer');
      try {
        const overlay = this.querySelector('#CartDrawer-Overlay');
        if (overlay) {
          overlay.addEventListener('click', this.close.bind(this));
        } else {
          console.warn('CartDrawer-Overlay element not found');
        }
      } catch (error) {
        console.error('Error setting up overlay:', error);
      }
      
      // Always open the drawer
      try {
        this.open();
        console.log('Cart drawer opened');
      } catch (error) {
        console.error('Error opening cart drawer:', error);
      }
    }, 100); // Slightly longer timeout to ensure DOM is ready
  }

  getSectionInnerHTML(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }

  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        selector: '#CartDrawer',
      },
      {
        id: 'cart-icon-bubble',
      },
    ];
  }

  getSectionDOM(html, selector = '.shopify-section') {
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector);
  }

  setActiveElement(element) {
    this.activeElement = element;
  }
}

customElements.define('cart-drawer', CartDrawer);

class CartDrawerItems extends CartItems {
  getSectionsToRender() {
    return [
      {
        id: 'cart-drawer',
        section: 'cart-drawer',
        selector: '.drawer__inner',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
    ];
  }

  // Override updateQuantity to make it more robust
  updateQuantity(line, quantity, name, variantId) {
    console.log('CartDrawerItems.updateQuantity() called', { line, quantity, name, variantId });
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section).join(','),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        console.log('Cart change response:', parsedState);
        // Continue with the rest of the method as in the parent class
        super.updateQuantity(line, quantity, name, variantId);
      })
      .catch((e) => {
        console.error('Error updating cart:', e);
        this.querySelectorAll('.loading__spinner').forEach((overlay) => overlay.classList.add('hidden'));
        const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
        if (errors) errors.textContent = window.cartStrings.error;
      })
      .finally(() => {
        this.disableLoading(line);
      });
  }
}

customElements.define('cart-drawer-items', CartDrawerItems);
