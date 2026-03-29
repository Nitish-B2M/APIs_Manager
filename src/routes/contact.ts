import express from 'express';
import { z } from 'zod';
import { ContactModel } from '../models/Contact';
import { authMiddleware } from '../middleware/auth';
import { adminMiddleware } from '../middleware/adminAuth';
import { catchAsync } from '../utils/catchAsync';

const router = express.Router();

const contactSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    message: z.string().min(10, "Message must be at least 10 characters")
});

// Public route to submit a contact form
router.post('/', catchAsync(async (req, res) => {
    try {
        const validatedData = contactSchema.parse(req.body);
        const newContact = await ContactModel.create({
            name: validatedData.name,
            email: validatedData.email,
            message: validatedData.message
        });

        return res.status(201).json({
            success: true,
            data: newContact,
            message: 'Message sent successfully. We will get back to you soon.'
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return res.status(400).json({ success: false, message: error.errors[0].message });
        }
        return res.status(500).json({ success: false, message: 'Failed to submit contact form.' });
    }
}));

// Admin ONLY routes
router.use(authMiddleware as any);
router.use(adminMiddleware as any);

router.get('/', catchAsync(async (req, res) => {
    try {
        const { status } = req.query;
        const contacts = await ContactModel.findAll(status as string);
        return res.json({ success: true, data: contacts });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
    }
}));

router.put('/:id/status', catchAsync(async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['NEW', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const updated = await ContactModel.updateStatus(id as string, status as any);
        if (!updated) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }

        return res.json({ success: true, data: updated, message: 'Status updated' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to update status.' });
    }
}));

router.delete('/:id', catchAsync(async (req, res) => {
    try {
        const { id } = req.params;
        const success = await ContactModel.delete(id as string);
        if (!success) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        return res.json({ success: true, message: 'Message deleted' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Failed to delete message.' });
    }
}));

export default router;
