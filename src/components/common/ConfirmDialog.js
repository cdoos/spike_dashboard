/**
 * ConfirmDialog Component
 * 
 * A modal dialog for confirming destructive actions.
 */

import React from 'react';
import PropTypes from 'prop-types';
import '../ConfirmDialog.css';

/**
 * Confirm Dialog Component
 * 
 * Displays a modal confirmation dialog with customizable title,
 * message, and button text.
 */
const ConfirmDialog = ({ 
  isOpen, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText, 
  cancelText,
  confirmVariant,
}) => {
  if (!isOpen) return null;

  const getConfirmButtonClass = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'confirm-btn confirm-delete';
      case 'warning':
        return 'confirm-btn confirm-warning';
      case 'primary':
      default:
        return 'confirm-btn confirm-primary';
    }
  };

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-buttons">
          <button className="confirm-btn confirm-cancel" onClick={onCancel}>
            {cancelText}
          </button>
          <button className={getConfirmButtonClass()} onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

ConfirmDialog.propTypes = {
  /** Whether the dialog is visible */
  isOpen: PropTypes.bool.isRequired,
  /** Dialog title */
  title: PropTypes.string.isRequired,
  /** Dialog message/description */
  message: PropTypes.string.isRequired,
  /** Callback when confirm button is clicked */
  onConfirm: PropTypes.func.isRequired,
  /** Callback when cancel button is clicked or overlay is clicked */
  onCancel: PropTypes.func.isRequired,
  /** Text for confirm button */
  confirmText: PropTypes.string,
  /** Text for cancel button */
  cancelText: PropTypes.string,
  /** Visual variant for confirm button */
  confirmVariant: PropTypes.oneOf(['primary', 'danger', 'warning']),
};

ConfirmDialog.defaultProps = {
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  confirmVariant: 'danger',
};

export default ConfirmDialog;
