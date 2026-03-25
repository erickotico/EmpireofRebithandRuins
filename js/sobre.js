
document.addEventListener('DOMContentLoaded', function() {
    const teamMembers = document.querySelectorAll('.team-member');
    teamMembers.forEach((member, index) => {
        member.style.animation = `fadeInUp 0.6s ease-out ${index * 0.1}s both`;
    });

    const timelineItems = document.querySelectorAll('.timeline-item');
    timelineItems.forEach((item, index) => {
        item.style.animation = `slideInLeft 0.7s ease-out ${index * 0.15}s both`;
    });

    const valueCards = document.querySelectorAll('.value-card');
    valueCards.forEach((card, index) => {
        card.style.animation = `scaleIn 0.6s ease-out ${index * 0.12}s both`;
    });
});

const teamMembers = document.querySelectorAll('.team-member');
teamMembers.forEach(member => {
    member.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s cubic-bezier(0.23, 1, 0.320, 1)';
    });

    member.addEventListener('mouseleave', function() {
    });
});
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.studio-info, .contact-links, .values-section').forEach(el => {
    observer.observe(el);
});

const socialLinks = document.querySelectorAll('.social-link');
socialLinks.forEach(link => {
    link.addEventListener('mouseenter', function() {
        this.style.transition = 'all 0.3s ease';
    });
});
window.addEventListener('scroll', function() {
    const scrollY = window.scrollY;
    document.querySelectorAll('.studio-info, .project-history').forEach(section => {
        section.style.transform = `translateY(${scrollY * 0.05}px)`;
    });
});

document.addEventListener('animationend', function(e) {
});
